export type MediaType = "movie" | "series";
export type Episode = {
  id: string;
  season: number;
  episode: number;
  name?: string;
  title?: string;
  thumbnail?: string;
  overview?: string;
  released?: string;
};
export type Media = {
  id: string;
  type: MediaType;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  runtime?: string;
  genres?: string[];
  cast?: string[];
  director?: string[];
  videos?: Episode[];
  trailers?: { source: string }[];
};
export type ProgressEntry = {
  id: string;
  type: MediaType;
  name: string;
  poster?: string;
  position: number;
  duration: number;
  updatedAt: string;
  season?: number;
  episode?: number;
  completed?: boolean;
};
export type Stream = {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  addon?: string;
  addonId?: string;
  addonName?: string;
  url?: string;
  infoHash?: string;
  externalUrl?: string;
  fileIdx?: number;
  behaviorHints?: { filename?: string; bingeGroup?: string };
  subtitles?: Subtitle[];
};
export type Subtitle = {
  id: string;
  url: string;
  lang: string;
  addonName?: string;
};
export type StreamResponse = {
  streams: Stream[];
  errors?: (string | { addon: string; error: string })[];
};
const base = "https://v3-cinemeta.strem.io";
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    signal: signal ?? AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error("O catálogo não respondeu. Tenta novamente.");
  return response.json() as Promise<T>;
}
export async function catalog(
  type: MediaType,
  options: { search?: string; genre?: string; skip?: number } = {},
  signal?: AbortSignal,
) {
  const parts = [
    options.search && `search=${encodeURIComponent(options.search)}`,
    options.genre && `genre=${encodeURIComponent(options.genre)}`,
    options.skip && `skip=${options.skip}`,
  ].filter(Boolean);
  const { metas } = await get<{ metas?: Media[] }>(
    `/catalog/${type}/top${parts.length ? "/" + parts.join("&") : ""}.json`,
    signal,
  );
  return (metas ?? [])
    .filter((item) => item.id && item.name)
    .map((item) => ({ ...item, type }));
}
export async function metadata(
  type: MediaType,
  id: string,
  signal?: AbortSignal,
) {
  if (!/^tt\d+$/.test(id)) throw new Error("Este título não é válido.");
  const { meta } = await get<{ meta?: Media }>(
    `/meta/${type}/${id}.json`,
    signal,
  );
  if (!meta) throw new Error("Não foi possível encontrar este título.");
  // Optional personal TMDB enrichment keeps the key on the API, never in catalogue requests.
  try {
    const response = await fetch(
      `/api/metadata?${new URLSearchParams({ type, id })}`,
      { credentials: "include", signal: signal ?? AbortSignal.timeout(10000) },
    );
    if (response.ok) {
      const extra = await response.json();
      if (extra.meta)
        return {
          ...meta,
          ...Object.fromEntries(
            Object.entries(extra.meta).filter(
              ([, v]) => v !== undefined && v !== null && v !== "",
            ),
          ),
          type,
        } as Media;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return { ...meta, type };
}
export const poster = (item: Pick<Media, "id" | "poster">) =>
  item.poster || `https://images.metahub.space/poster/medium/${item.id}/img`;
export const backdrop = (item: Pick<Media, "id" | "background">) =>
  item.background ||
  `https://images.metahub.space/background/medium/${item.id}/img`;
export const titleHref = (item: Pick<Media, "id" | "type">) =>
  `/titulo?${new URLSearchParams({ id: item.id, type: item.type })}`;
export function progressRatio(entry?: ProgressEntry) {
  return entry && Number.isFinite(entry.duration) && entry.duration > 0
    ? Math.min(1, Math.max(0, entry.position / entry.duration))
    : 0;
}
export function streamFacts(stream: Stream) {
  const text = [
    stream.name,
    stream.title,
    stream.description,
    stream.behaviorHints?.filename,
  ]
    .filter(Boolean)
    .join(" ");
  const quality = text.match(/\b(2160p|1080p|720p|480p|4k)\b/i)?.[0] ?? "";
  const sizeMatch = text.match(/([\d.]+)\s*(GB|MB)\b/i);
  const seedersMatch = text.match(/(?:👤|👥|seeders?[:\s]*)\s*(\d+)/i);
  return {
    quality,
    hdr: /\b(?:DV|DoVi|Dolby Vision)\b/i.test(text)
      ? "Dolby Vision"
      : (text.match(/HDR10\+?|HDR/i)?.[0] ?? ""),
    codec: text.match(/HEVC|H\.?265|AV1|H\.?264|x264|x265/i)?.[0] ?? "",
    size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : "",
    bytes: sizeMatch
      ? Number(sizeMatch[1]) * (/GB/i.test(sizeMatch[2]) ? 1024 : 1)
      : 0,
    seeders: seedersMatch ? Number(seedersMatch[1]) : undefined,
    rank: /2160|4k/i.test(quality)
      ? 4
      : /1080/.test(quality)
        ? 3
        : /720/.test(quality)
          ? 2
          : /480/.test(quality)
            ? 1
            : 0,
    cached: /(?:\[RD\+\]|\[AD\+\]|\[PM\+\]|⚡|cached|em cache)/i.test(text),
  };
}
export function safeMediaURL(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function playbackKey(
  item: Pick<Media, "id" | "type">,
  episode?: Episode,
) {
  return episode?.id || item.id;
}
export const formatTime = (value: number) => {
  const n = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${n >= 3600 ? Math.floor(n / 3600) + ":" : ""}${n >= 3600 ? String(Math.floor(n / 60) % 60).padStart(2, "0") : Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
