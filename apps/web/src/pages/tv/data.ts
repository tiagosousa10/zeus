import { api } from "../../lib/api";
import type { Summary, Page, Section, SearchEntry, Programme } from "./types";
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
