import type {
  PlaybackTarget,
  TVMovieDetail,
  TVSeriesDetail,
} from "../models/types";
import type { PlaybackSession } from "../models/playback-helpers";
import type { GuideGrid } from "../models/guide-helpers";
import { api } from "../../../shared/services/api";
import type {
  Summary,
  Page,
  Section,
  SearchEntry,
  Programme,
} from "../models/types";
export const tvKeys = {
  list: (id: string) => ["tv", id] as const,
  summary: (id: string, visibility: string) => [
    "tv",
    id,
    "summary",
    visibility,
  ],
  page: (id: string, s: Section, c: string, p: number, v: string) => [
    "tv",
    id,
    s,
    c,
    p,
    v,
  ],
  search: (id: string, v: string) => ["tv", id, "search", v],
};
export const listPath = (id: string) => "/iptv/lists/" + encodeURIComponent(id);
export const tvAPI = {
  details: (
    id: string,
    section: Section,
    itemId: string,
    signal?: AbortSignal,
  ) =>
    api<TVMovieDetail | TVSeriesDetail>(
      `${listPath(id)}/${section}/${encodeURIComponent(itemId)}`,
      { signal },
    ),
  channelGuide: (
    id: string,
    channelId: string,
    from: number,
    to: number,
    signal?: AbortSignal,
  ) =>
    api<Programme[]>(
      `${listPath(id)}/epg/channel/${encodeURIComponent(channelId)}?from=${from}&to=${to}`,
      { signal },
    ),
  guideWindow: (
    id: string,
    window: {
      from: number;
      to: number;
      timezone: string;
      page: number;
      category: string;
      favorites: boolean;
    },
    signal?: AbortSignal,
  ) =>
    api<GuideGrid>(
      listPath(id) +
        "/epg/grid?" +
        new URLSearchParams({
          from: String(window.from),
          to: String(window.to),
          timezone: window.timezone,
          page: String(window.page),
          size: "40",
          ...(window.category ? { category: window.category } : {}),
          favorites: window.favorites ? "1" : "0",
        }),
      { signal },
    ),
  start: (id: string, target: PlaybackTarget, signal?: AbortSignal) =>
    api<PlaybackSession>(listPath(id) + "/play", {
      method: "POST",
      signal,
      body: JSON.stringify({
        section: target.section,
        id: target.id,
        ...(target.episodeId ? { episodeId: target.episodeId } : {}),
      }),
    }),
  stop: (token: string) =>
    api(`/iptv/play/${encodeURIComponent(token)}/stop`, {
      method: "POST",
      keepalive: true,
    }),
  summary: (id: string, signal?: AbortSignal) =>
    api<Summary>(listPath(id), { signal }),
  refresh: (id: string) =>
    api<Summary>(listPath(id) + "/refresh", { method: "POST" }),
  page: <T>(
    id: string,
    s: Section,
    c: string,
    p = 0,
    signal?: AbortSignal,
    filters: {
      tag?: string;
      favorites?: boolean;
      q?: string;
      anchor?: string;
    } = {},
  ) =>
    api<Page<T>>(
      `${listPath(id)}/${s}/categories/${encodeURIComponent(c)}?page=${p}&size=48&${new URLSearchParams({ ...(filters.anchor ? { anchor: filters.anchor } : {}), ...(filters.tag ? { tag: filters.tag } : {}), ...(filters.q ? { q: filters.q } : {}), favorites: filters.favorites ? "1" : "0" })}`,
      { signal },
    ),
  search: (id: string, signal?: AbortSignal) =>
    api<SearchEntry[]>(listPath(id) + "/search-index", { signal }),
  now: (id: string, c: string, signal?: AbortSignal) =>
    api<Record<string, { now?: Programme; next?: Programme }>>(
      listPath(id) + "/epg/now?category=" + encodeURIComponent(c),
      { signal },
    ),
};
