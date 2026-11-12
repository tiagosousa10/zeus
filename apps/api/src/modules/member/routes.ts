import { Hono } from "hono";
import { z } from "zod";
import { requireMember } from "../auth/middleware.js";
import { getState, patchState } from "./service.js";
import { db } from "../../db/client.js";
import { addon } from "../../db/schema.js";
import { configFields, validateConfig } from "../addons/config.js";
import { streamEndpoint } from "../addons/streams.js";
import { eq } from "drizzle-orm";
const json = z.record(z.string(), z.unknown());
const patch = z
  .object({
    preferences: json.optional(),
    library: z.array(json).max(10000).optional(),
    progress: json.optional(),
    iptv: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            type: z.enum(["m3u", "xtream"]),
            url: z.url(),
            username: z.string().optional(),
            password: z.string().optional(),
            epgUrl: z.union([z.url(), z.literal("")]).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    addons: z
      .array(
        z
          .object({
            id: z.string(),
            enabled: z.boolean().optional(),
            config: json.optional(),
            manifestUrl: z.url().max(4000).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    onboardingDone: z.boolean().optional(),
  })
  .strict();
export const memberRoutes = new Hono();
memberRoutes.use("*", requireMember);
memberRoutes.get("/", async (c) => c.json(await getState(c.get("member").id)));
memberRoutes.patch("/", async (c) => {
  const body = patch.parse(await c.req.json());
  if (body.addons) {
    const approved = await db
      .select()
      .from(addon)
      .where(eq(addon.status, "approved"));
    for (const entry of body.addons) {
      const a = approved.find((a) => a.id === entry.id);
      if (!a)
        return c.json({ error: "Só podes instalar Add-ons aprovados." }, 400);
      if (entry.manifestUrl) {
        const configured = new URL(entry.manifestUrl);
        if (
          configured.protocol !== "https:" ||
          configured.hostname !== new URL(a.manifestUrl).hostname ||
          !configured.pathname.endsWith("/manifest.json")
        )
          return c.json(
            {
              error:
                "Cola o URL do manifesto gerado na página de configuração deste Add-on.",
            },
            400,
          );
        delete entry.config;
        continue;
      }
      if (entry.enabled === false) continue;
      const fields = configFields(a.configFields);
      if (
        a.configurationRequired &&
        !fields.length &&
        new URL(a.manifestUrl).hostname !== "torrentio.strem.fun"
      )
        return c.json(
          {
            error:
              "Este Add-on precisa do URL gerado na sua página de configuração.",
          },
          400,
        );
      try {
        if (fields.length)
          entry.config = validateConfig(fields, entry.config || {});
        else
          streamEndpoint(
            a.manifestUrl,
            entry.config || {},
            "movie",
            "tt0000000",
          );
      } catch (e) {
        return c.json(
          { error: e instanceof Error ? e.message : "Configuração inválida." },
          400,
        );
      }
    }
  }
  return c.json(await patchState(c.get("member").id, body));
});
