import { DomainError } from "../../lib/domain-error.js";
import { safeFetch } from "../../lib/safe-fetch.js";
import { installedAddons, installedEndpoint } from "./stream-service.js";
import { subtitleLink, validSubtitleSignature } from "./subtitle-link.js";

export function srtToVtt(text: string) {
  const clean = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  if (clean.startsWith("WEBVTT")) return clean;
  return (
    "WEBVTT\n\n" +
    clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2").trim() +
    "\n"
  );
}

// Muitas legendas antigas vêm em Windows-1252; um UTF-8 inválido denuncia-o.
function decode(bytes: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export const listSubtitles = async (
  memberId: string,
  input: import("./models.js").ListSubtitlesInputData,
) => {
  const { type, id } = input;

  const installed = await installedAddons(memberId, "subtitles");
  const results = await Promise.all(
    installed
      .filter(({ addon }: any) => addon)
      .map(async ({ entry, addon: a }: any) => {
        try {
          const response = await safeFetch(
            installedEndpoint(a, entry, "subtitles", type, id),
            { timeout: 12000, maxBytes: 1024 * 1024 },
          );
          if (!response.ok) throw new Error();
          const result = (await response.json()) as any;
          if (!Array.isArray(result.subtitles)) throw new Error();
          return {
            subtitles: result.subtitles
              .slice(0, 200)
              .filter(
                (t: any) =>
                  typeof t?.url === "string" &&
                  /^https?:\/\//.test(t.url) &&
                  typeof t.lang === "string",
              )
              .map((t: any, i: number) => ({
                id: `${a.id}:${t.id ?? i}`,
                url: subtitleLink(t.url),
                lang: t.lang,
                addonName: a.name,
              })),
          };
        } catch {
          return {
            subtitles: [],
            error: `${a.name}: não foi possível obter legendas.`,
          };
        }
      }),
  );
  return {
    subtitles: results.flatMap((r) => r.subtitles),
    errors: results.flatMap((r) => (r.error ? [r.error] : [])),
  };
};

export const subtitleFile = async (
  input: import("./models.js").SubtitleFileInputData,
) => {
  const { url, sig } = input;

  if (!validSubtitleSignature(url, sig))
    throw new DomainError("forbidden", { error: "Legenda não reconhecida." });
  try {
    const response = await safeFetch(url, {
      timeout: 15000,
      maxBytes: 3 * 1024 * 1024,
    });
    if (!response.ok) throw new Error();
    return srtToVtt(decode(await response.arrayBuffer()));
  } catch {
    throw new DomainError("upstream", {
      error: "Não foi possível obter esta legenda.",
    });
  }
};
