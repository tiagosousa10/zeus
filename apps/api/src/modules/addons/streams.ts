import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { addon } from "../../db/schema.js";
import { requireMember } from "../auth/middleware.js";
import { getState } from "../member/service.js";
import { configFields, validateConfig, type ConfigField } from "./config.js";
import { safeFetch } from "../../lib/safe-fetch.js";
import { subtitleLink } from "./subtitle-link.js";

export function streamEndpoint(
  manifestUrl: string,
  config: Record<string, unknown>,
  type: string,
  id: string,
  fields: ConfigField[] = [],
  resource: "stream" | "subtitles" = "stream",
) {
  const base = new URL(manifestUrl);
  base.search = "";
  base.hash = "";
  let directory = base.pathname
    .replace(/\/manifest\.json$/, "")
    .replace(/\/$/, "");
  const entries = Object.entries(config).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (base.hostname !== "torrentio.strem.fun" && fields.length) {
    const values = validateConfig(fields, config);
    directory += "/" + encodeURIComponent(JSON.stringify(values));
  } else if (entries.length) {
    if (base.hostname !== "torrentio.strem.fun")
      throw new Error("Este Add-on ainda não tem adaptador de configuração.");
    const parts: string[] = [];
    const allowed = new Set([
      "realdebrid",
      "alldebrid",
      "premiumize",
      "debridlink",
      "torbox",
      "easydebrid",
      "offcloud",
      "putio",
    ]);
    if (config.debridProvider && config.apiKey) {
      if (!allowed.has(String(config.debridProvider)))
        throw new Error("Fornecedor Debrid não suportado.");
      parts.push(
        `${config.debridProvider}=${encodeURIComponent(String(config.apiKey))}`,
      );
    }
    if (config.sort) {
      if (
        !["qualitysize", "qualityseeders", "seeders", "size"].includes(
          String(config.sort),
        )
      )
        throw new Error("Ordenação não suportada.");
      parts.push(`sort=${config.sort}`);
    }
    if (config.providers) {
      if (!/^[a-z0-9,]+$/i.test(String(config.providers)))
        throw new Error("Fornecedores inválidos.");
      parts.push(`providers=${config.providers}`);
    }
    if (config.qualityfilter !== undefined && config.qualityfilter !== "") {
      // Torrentio's public Quality::key values (domain/filter.rs).
      const qualities = new Set([
        "brremux",
        "hdrall",
        "dolbyvision",
        "dolbyvisionwithhdr",
        "threed",
        "nonthreed",
        "4k",
        "1080p",
        "720p",
        "480p",
        "other",
        "scr",
        "cam",
        "unknown",
      ]);
      if (
        typeof config.qualityfilter !== "string" ||
        !config.qualityfilter.split(",").every((value) => qualities.has(value))
      )
        throw new Error("Qualidades inválidas.");
      parts.push(`qualityfilter=${config.qualityfilter}`);
    }
    if (parts.length) directory += "/" + parts.join("|");
  }
  base.pathname = `${directory}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;
  return base.toString();
}
/** O URL configurado pelo Membro já leva as chaves; substitui o manifesto e a configuração. */
export function installedEndpoint(
  a: typeof addon.$inferSelect,
  entry: { manifestUrl?: string; config?: Record<string, unknown> },
  resource: "stream" | "subtitles",
  type: string,
  id: string,
) {
  return entry.manifestUrl
    ? streamEndpoint(entry.manifestUrl, {}, type, id, [], resource)
    : streamEndpoint(
        a.manifestUrl,
        entry.config || {},
        type,
        id,
        configFields(a.configFields),
        resource,
      );
}
export async function installedAddons(
  memberId: string,
  resource: "stream" | "subtitles",
) {
  const state = await getState(memberId);
  const approved = await db
    .select()
    .from(addon)
    .where(eq(addon.status, "approved"));
  return state.addons
    .filter((a: any) => a.enabled !== false)
    .slice(0, 20)
    .map((entry: any) => ({
      entry,
      addon: approved.find((a) => a.id === entry.id),
    }))
    .filter(({ addon }: any) => !addon || addon.resources.includes(resource));
}
export const streamRoutes = new Hono();
streamRoutes.use("*", requireMember);
streamRoutes.get("/", async (c) => {
  const { type, id } = z
    .object({
      type: z.enum(["movie", "series"]),
      id: z
        .string()
        .min(1)
        .max(180)
        .regex(/^[a-zA-Z0-9:_-]+$/),
    })
    .parse(c.req.query());
  const installed = await installedAddons(c.get("member").id, "stream");
  const results = await Promise.all(
    installed.map(async ({ entry, addon: a }: any) => {
      if (!a)
        return {
          streams: [],
          error: "Um Add-on instalado deixou de estar aprovado.",
        };
      try {
        const endpoint = installedEndpoint(a, entry, "stream", type, id);
        const response = await safeFetch(endpoint, {
          timeout: 12000,
          maxBytes: 2 * 1024 * 1024,
        });
        if (!response.ok) throw new Error("O Add-on não respondeu.");
        const result = (await response.json()) as any;
        if (!Array.isArray(result.streams))
          throw new Error("Resposta inválida.");
        return {
          streams: result.streams
            .slice(0, 100)
            .filter(
              (s: any) =>
                typeof s === "object" &&
                s !== null &&
                ((typeof s.infoHash === "string" &&
                  /^[a-f0-9]{40}$/i.test(s.infoHash)) ||
                  (typeof s.url === "string" && /^https?:\/\//.test(s.url))),
            )
            .map((s: any) => ({
              name: typeof s.name === "string" ? s.name : a.name,
              title: typeof s.title === "string" ? s.title : "",
              url: s.url,
              infoHash: s.infoHash,
              fileIdx:
                Number.isInteger(s.fileIdx) && s.fileIdx >= 0
                  ? s.fileIdx
                  : undefined,
              behaviorHints: s.behaviorHints,
              subtitles: Array.isArray(s.subtitles)
                ? s.subtitles
                    .filter(
                      (t: any) =>
                        typeof t?.url === "string" &&
                        /^https?:\/\//.test(t.url) &&
                        typeof t.lang === "string",
                    )
                    .map((t: any, i: number) => ({
                      id: String(t.id || i),
                      url: subtitleLink(t.url),
                      lang: t.lang,
                    }))
                : [],
              addonId: a.id,
              addonName: a.name,
            })),
        };
      } catch {
        return {
          streams: [],
          error: `${a.name}: não foi possível obter Fontes. Confirma a configuração ou tenta novamente.`,
        };
      }
    }),
  );
  return c.json({
    streams: results.flatMap((r) => r.streams),
    errors: results.flatMap((r) => (r.error ? [r.error] : [])),
  });
});
