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
  if (r.status === 401) throw new ProviderError(REFUSED);
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

const refused = (v: unknown): boolean => {
  const auth = (v as { user_info?: { auth?: unknown } } | null)?.user_info?.auth;
  return auth === 0 || auth === "0";
};

async function xtreamList(list: IPTVList, action: string): Promise<unknown[]> {
  const v = await xtream(list, action);
  if (Array.isArray(v)) return v;
  throw new ProviderError(refused(v) ? REFUSED : undefined);
}

async function loadCatalog(list: IPTVList, now: number): Promise<TVCatalog> {
  if (list.type === "m3u") return normalizeM3U(await (await request(list.url)).text(), list.url, now);
  const liveCategories = await xtreamList(list, "get_live_categories");
  const live = await xtreamList(list, "get_live_streams");
  const vodCategories = await xtreamList(list, "get_vod_categories");
  const vod = await xtreamList(list, "get_vod_streams");
  const seriesCategories = await xtreamList(list, "get_series_categories");
  const series = await xtreamList(list, "get_series");
  return normalizeXtreamCatalog({ liveCategories, live, vodCategories, vod, seriesCategories, series }, now);
}

export function fetchCatalog(list: IPTVList, now: number): Promise<TVCatalog> {
  return guard(async () => {
    const catalog = await loadCatalog(list, now);
    if (!catalog.live.items.length && !catalog.movie.items.length && !catalog.series.items.length) throw new ProviderError();
    return catalog;
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
