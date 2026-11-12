import { channelTags, cleanFolderName, detectCountry, isAdult } from "./names.js";
import type {
  SectionData, TVCatalog, TVCategory, TVChannel, TVEpisode, TVMovie, TVMovieDetail, TVSeries, TVSeriesDetail, Section,
} from "./types.js";

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Rec[] : []);
const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};
const num = (v: unknown): number | undefined => {
  const s = str(v);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
};
const year = (...vs: unknown[]): number | undefined => {
  for (const v of vs) {
    const m = str(v)?.match(/\d{4}/);
    if (m) return Number(m[0]);
  }
  return undefined;
};
const firstString = (v: unknown): string | undefined => (Array.isArray(v) ? str(v[0]) : str(v));
const castList = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : (str(v) ?? "").split(","))
    .map((x) => x.trim())
    .filter(Boolean);
const minutes = (info: Rec): number | undefined => {
  const secs = num(info.duration_secs);
  if (secs !== undefined) return Math.round(secs / 60);
  const d = str(info.duration)?.match(/^(?:(\d+):)?(\d+):(\d+)$/);
  return d ? Number(d[1] ?? 0) * 60 + Number(d[2]) : undefined;
};

export function xtreamUrl(
  list: { url: string; username?: string; password?: string },
  action: string,
  params: Record<string, string> = {},
): string {
  const u = new URL("/player_api.php", list.url);
  if (list.username !== undefined) u.searchParams.set("username", list.username);
  if (list.password !== undefined) u.searchParams.set("password", list.password);
  u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

function section<T extends { categoryId: string }>(
  kind: Section,
  rawCategories: unknown,
  items: T[],
): SectionData<T> {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.categoryId, (counts.get(it.categoryId) ?? 0) + 1);
  const categories: TVCategory[] = [];
  const seen = new Set<string>();
  const add = (id: string, rawName: string | undefined) => {
    if (seen.has(id)) return;
    seen.add(id);
    const name = rawName ? cleanFolderName(rawName) || "Outros" : "Outros";
    categories.push({ id, section: kind, name, country: detectCountry(name), adult: isAdult(name), count: counts.get(id) ?? 0 });
  };
  for (const c of list(rawCategories)) {
    const id = str(c.category_id);
    if (id) add(id, str(c.category_name));
  }
  for (const it of items) add(it.categoryId, undefined);
  return { categories, items };
}

export function normalizeXtreamCatalog(
  raw: { liveCategories: unknown; live: unknown; vodCategories: unknown; vod: unknown; seriesCategories: unknown; series: unknown },
  now: number,
): TVCatalog {
  const live: TVChannel[] = [];
  for (const r of list(raw.live)) {
    const id = str(r.stream_id);
    const name = str(r.name);
    if (!id || !name) continue;
    live.push({
      id, categoryId: str(r.category_id) ?? "", name, number: num(r.num), logo: str(r.stream_icon), epgId: str(r.epg_channel_id),
      tags: channelTags(name), adult: isAdult(name),
    });
  }
  const movie: TVMovie[] = [];
  for (const r of list(raw.vod)) {
    const id = str(r.stream_id);
    const name = str(r.name);
    if (!id || !name) continue;
    movie.push({
      id, categoryId: str(r.category_id) ?? "", name, poster: str(r.stream_icon), year: year(r.year, r.releaseDate, r.releasedate),
      rating: num(r.rating), added: num(r.added), container: str(r.container_extension) ?? "mp4", adult: isAdult(name),
    });
  }
  const series: TVSeries[] = [];
  for (const r of list(raw.series)) {
    const id = str(r.series_id);
    const name = str(r.name);
    if (!id || !name) continue;
    series.push({
      id, categoryId: str(r.category_id) ?? "", name, poster: str(r.cover), year: year(r.year, r.releaseDate, r.releasedate),
      rating: num(r.rating), added: num(r.last_modified), adult: isAdult(name),
    });
  }
  const liveData = section("live", raw.liveCategories, live);
  const movieData = section("movie", raw.vodCategories, movie);
  const seriesData = section("series", raw.seriesCategories, series);
  for (const data of [liveData, movieData, seriesData] as SectionData<TVChannel | TVMovie | TVSeries>[]) {
    const adultIds = new Set(data.categories.filter((c) => c.adult).map((c) => c.id));
    for (const it of data.items) if (adultIds.has(it.categoryId)) it.adult = true;
  }
  return { fetchedAt: now, live: liveData, movie: movieData, series: seriesData };
}

export function normalizeVodInfo(raw: unknown, base: TVMovie): TVMovieDetail {
  const info = rec(rec(raw).info);
  return {
    ...base,
    poster: base.poster ?? str(info.movie_image),
    year: base.year ?? year(info.releasedate, info.release_date),
    backdrop: firstString(info.backdrop_path),
    plot: str(info.plot) ?? str(info.description),
    cast: castList(info.cast),
    director: str(info.director),
    genre: str(info.genre),
    durationMin: minutes(info),
    age: str(info.age) ?? str(info.mpaa_rating),
    trailer: str(info.youtube_trailer),
    tmdbId: str(info.tmdb_id),
  };
}

export function normalizeSeriesInfo(raw: unknown, base: TVSeries): TVSeriesDetail {
  const r = rec(raw);
  const info = rec(r.info);
  const names = new Map<number, string>();
  for (const s of list(r.seasons)) {
    const n = num(s.season_number);
    const name = str(s.name);
    if (n !== undefined && name) names.set(n, name);
  }
  const bySeason = new Map<number, TVEpisode[]>();
  const push = (season: number | undefined, e: Rec) => {
    const id = str(e.id);
    if (!id || season === undefined) return;
    const ei = rec(e.info);
    const number = num(e.episode_num) ?? 0;
    const ep: TVEpisode = {
      id, season, number, title: str(e.title) ?? `Episódio ${number}`, thumb: str(ei.movie_image), plot: str(ei.plot),
      durationMin: minutes(ei), container: str(e.container_extension) ?? "mp4",
    };
    bySeason.set(season, [...(bySeason.get(season) ?? []), ep]);
  };
  if (Array.isArray(r.episodes)) {
    r.episodes.forEach((v, i) => {
      if (Array.isArray(v)) for (const e of list(v)) push(num(e.season) ?? i + 1, e);
      else for (const e of list([v])) push(num(e.season), e);
    });
  } else for (const [k, v] of Object.entries(rec(r.episodes))) for (const e of list(v)) push(num(k), e);
  const seasons = [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, episodes]) => ({
      number,
      name: names.get(number) ?? `Temporada ${number}`,
      episodes: episodes.sort((a, b) => a.number - b.number),
    }));
  return {
    ...base,
    poster: base.poster ?? str(info.cover),
    backdrop: firstString(info.backdrop_path),
    plot: str(info.plot),
    cast: castList(info.cast),
    genre: str(info.genre),
    seasons,
  };
}
