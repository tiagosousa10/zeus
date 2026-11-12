import type { IPTVList, TVCatalog, TVSeriesDetail } from "./types.js";

export interface Account {
  formats: ("m3u8" | "ts")[];
  maxConnections?: number;
  activeConnections?: number;
  expiresAt?: number;
}
export type Target =
  | { section: "live"; id: string }
  | { section: "movie"; id: string }
  | { section: "series"; id: string; episodeId: string };
export type Upstream = { url: string; kind: "hls" | "ts" | "file"; container: string };

export { fetchAccount } from "./provider.js";

const isHls = (url: string): boolean => {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return false;
  }
};

function m3uUpstream(target: Target, source: string | undefined, container: string | undefined): Upstream | undefined {
  if (!source) return undefined;
  if (isHls(source)) return { url: source, kind: "hls", container: "m3u8" };
  if (target.section === "live") return { url: source, kind: "ts", container: "ts" };
  return { url: source, kind: "file", container: container ?? "mp4" };
}

export function upstreamFor(
  list: IPTVList,
  catalog: TVCatalog,
  detail: TVSeriesDetail | undefined,
  account: Account,
  target: Target,
): Upstream | undefined {
  const m3u = list.type === "m3u";
  const origin = new URL(list.url).origin;
  const user = encodeURIComponent(list.username ?? "");
  const pass = encodeURIComponent(list.password ?? "");

  if (target.section === "live") {
    const channel = catalog.live.items.find((c) => c.id === target.id);
    if (!channel) return undefined;
    if (m3u) return m3uUpstream(target, channel.source, undefined);
    const hls = account.formats.length === 0 || account.formats.includes("m3u8");
    const ext = hls ? "m3u8" : "ts";
    return { url: `${origin}/live/${user}/${pass}/${target.id}.${ext}`, kind: hls ? "hls" : "ts", container: ext };
  }
  if (target.section === "movie") {
    const movie = catalog.movie.items.find((x) => x.id === target.id);
    if (!movie) return undefined;
    if (m3u) return m3uUpstream(target, movie.source, movie.container);
    return { url: `${origin}/movie/${user}/${pass}/${movie.id}.${movie.container}`, kind: "file", container: movie.container };
  }
  const episodes = m3u
    ? (catalog.series.items.find((s) => s.id === target.id)?.episodes ?? [])
    : (detail?.seasons.flatMap((s) => s.episodes) ?? []);
  const episode = episodes.find((e) => e.id === target.episodeId);
  if (!episode) return undefined;
  if (m3u) return m3uUpstream(target, episode.source, episode.container);
  return { url: `${origin}/series/${user}/${pass}/${episode.id}.${episode.container}`, kind: "file", container: episode.container };
}
