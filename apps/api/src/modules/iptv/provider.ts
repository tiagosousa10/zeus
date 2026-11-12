import { safeFetch } from "../../lib/safe-fetch.js";
import { normalizeM3U } from "./m3u.js";
import { normalizeSeriesInfo, normalizeVodInfo, normalizeXtreamCatalog, xtreamUrl } from "./xtream.js";
import type { IPTVList, TVCatalog, TVMovie, TVMovieDetail, TVSeries, TVSeriesDetail } from "./types.js";

const REFUSED = "A lista recusou o utilizador ou a palavra-passe.";
const UNAVAILABLE = "O fornecedor da lista não respondeu. Tenta de novo.";

export class ProviderError extends Error {
  constructor(message = UNAVAILABLE) {
    super(message);
    this.name = "ProviderError";
  }
}

let fetcher = safeFetch;
export function setProviderFetch(f: typeof safeFetch): void {
  fetcher = f;
}

async function request(url: string): Promise<Response> {
  const r = await fetcher(url, { timeout: 60_000, maxBytes: 64 * 1024 * 1024 });
  if (!r.ok) throw new ProviderError();
  return r;
}

// The original error may carry the list URL and credentials, so it never leaves this module.
async function guard<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    throw e instanceof ProviderError ? e : new ProviderError();
  }
}

const xtream = async (list: IPTVList, action: string, params?: Record<string, string>): Promise<unknown> =>
  (await request(xtreamUrl(list, action, params))).json();

const refused = (v: unknown): boolean =>
  !!v && typeof v === "object" && !Array.isArray(v) && (v as { user_info?: { auth?: unknown } }).user_info?.auth === 0;

export function fetchCatalog(list: IPTVList, now: number): Promise<TVCatalog> {
  return guard(async () => {
    if (list.type === "m3u") return normalizeM3U(await (await request(list.url)).text(), list.url, now);
    const liveCategories = await xtream(list, "get_live_categories");
    if (refused(liveCategories)) throw new ProviderError(REFUSED);
    const live = await xtream(list, "get_live_streams");
    const vodCategories = await xtream(list, "get_vod_categories");
    const vod = await xtream(list, "get_vod_streams");
    const seriesCategories = await xtream(list, "get_series_categories");
    const series = await xtream(list, "get_series");
    return normalizeXtreamCatalog({ liveCategories, live, vodCategories, vod, seriesCategories, series }, now);
  });
}

export async function fetchMovie(list: IPTVList, base: TVMovie): Promise<TVMovieDetail> {
  if (list.type === "m3u") return { ...base, cast: [] };
  return guard(async () => normalizeVodInfo(await xtream(list, "get_vod_info", { vod_id: base.id }), base));
}

export async function fetchSeries(list: IPTVList, base: TVSeries): Promise<TVSeriesDetail> {
  if (list.type === "m3u") return { ...base, cast: [], seasons: [] };
  return guard(async () => normalizeSeriesInfo(await xtream(list, "get_series_info", { series_id: base.id }), base));
}
