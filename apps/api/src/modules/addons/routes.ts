import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { addon } from "../../db/schema.js";
import { requireMember, requireAdmin } from "../auth/middleware.js";
import { configFields } from "./config.js";
import { safeFetch } from "../../lib/safe-fetch.js";
export const addonRoutes = new Hono();
addonRoutes.use("*", requireMember);
addonRoutes.get("/", async (c) =>
  c.json({
    addons: await db.select().from(addon).where(eq(addon.status, "approved")),
  }),
);
export const addonAdminRoutes = new Hono();
addonAdminRoutes.use("*", requireMember, requireAdmin);
addonAdminRoutes.get("/", async (c) =>
  c.json({ addons: await db.select().from(addon) }),
);
addonAdminRoutes.patch("/:id", async (c) => {
  const b = z
    .object({ status: z.enum(["approved", "rejected"]) })
    .parse(await c.req.json());
  const [current] = await db
    .select()
    .from(addon)
    .where(eq(addon.id, c.req.param("id")));
  if (!current) return c.json({ error: "Add-on não encontrado." }, 404);
  let fields = current.configFields,
    required = current.configurationRequired;
  if (b.status === "approved") {
    try {
      const response = await safeFetch(current.manifestUrl, {
        timeout: 10000,
        maxBytes: 512 * 1024,
      });
      if (!response.ok) throw new Error();
      const manifest = (await response.json()) as any;
      if (
        typeof manifest.id !== "string" ||
        typeof manifest.name !== "string" ||
        !Array.isArray(manifest.resources)
      )
        throw new Error();
      fields = configFields(manifest.config);
      required = manifest.behaviorHints?.configurationRequired === true;
    } catch {
      return c.json(
        {
          error:
            "Não foi possível validar o manifesto atual deste Add-on. Tenta novamente antes de aprovar.",
        },
        502,
      );
    }
  }
  const [a] = await db
    .update(addon)
    .set({ ...b, configFields: fields, configurationRequired: required })
    .where(eq(addon.id, current.id))
    .returning();
  return c.json({ addon: a });
});
addonAdminRoutes.post("/sync", async (c) => {
  const response = await fetch(
    "https://stremio-community.github.io/stremio-addons-list/catalog.json",
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok)
    return c.json({ error: "O registo público não está disponível." }, 502);
  const payload = await response.json();
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.addons)
      ? payload.addons
      : null;
  if (!items)
    return c.json({ error: "Formato do registo público não suportado." }, 502);
  let count = 0;
  for (const value of items.slice(0, 2000)) {
    const url =
      value.manifestUrl ||
      value.manifest_url ||
      value.url ||
      value.transportUrl;
    if (typeof url !== "string" || !url.startsWith("https://")) continue;
    const name = value.name || value.manifest?.name;
    if (typeof name !== "string") continue;
    await db
      .insert(addon)
      .values({
        id:
          typeof value.manifest?.id === "string"
            ? value.manifest.id
            : typeof value.id === "string"
              ? value.id
              : url,
        name: name.slice(0, 200),
        description: String(
          value.description || value.manifest?.description || "",
        ).slice(0, 2000),
        manifestUrl: url,
        status: "pending",
        configFields: configFields(value.manifest?.config),
        configurationRequired:
          value.manifest?.behaviorHints?.configurationRequired === true,
        configurable:
          value.manifest?.behaviorHints?.configurable === true ||
          value.manifest?.behaviorHints?.configurationRequired === true,
        resources: (Array.isArray(value.manifest?.resources)
          ? value.manifest.resources
          : []
        )
          .map((r: any) => (typeof r === "string" ? r : r?.name))
          .filter((r: any) => r === "stream" || r === "subtitles"),
      })
      .onConflictDoNothing();
    count++;
  }
  return c.json({ imported: count });
});
