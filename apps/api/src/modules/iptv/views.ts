import type {
  Section,
  TVCatalog,
  TVChannel,
  TVEpisode,
  TVMovie,
  TVSeries,
  TVSeriesDetail,
} from "./types.js";
import {
  adultItemsVisible,
  isCategoryHidden,
  orderCategories,
  type TVListPrefs,
} from "./prefs.js";

type Item = TVChannel | TVMovie | TVSeries;
export interface CategoryView {
  id: string;
  name: string;
  country?: string;
  count: number;
  pinned: boolean;
  hidden: boolean;
}
export interface SectionView {
  categories: CategoryView[];
  total: number;
  hiddenCount: number;
}

const SECTIONS: Section[] = ["live", "movie", "series"];
const KIND = { live: "l", movie: "m", series: "s" } as const;

export function publicItem<T extends object>(
  item: T,
): Omit<T, "source" | "episodes"> {
  const {
    source: _source,
    episodes: _episodes,
    ...rest
  } = item as T & { source?: string; episodes?: unknown };
  return rest;
}

export function publicSeriesDetail(d: TVSeriesDetail): TVSeriesDetail {
  const { episodes: _episodes, ...rest } = d;
  return {
    ...rest,
    seasons: d.seasons.map((s) => ({
      ...s,
      episodes: s.episodes.map((e) => publicItem(e) as TVEpisode),
    })),
  };
}

function visibleItems(c: TVCatalog, p: TVListPrefs, section: Section): Item[] {
  const hidden = new Set(
    c[section].categories
      .filter((cat) => isCategoryHidden(cat, p))
      .map((cat) => cat.id),
  );
  const adult = adultItemsVisible(c[section].categories, p);
  return (c[section].items as Item[]).filter(
    (i) => !hidden.has(i.categoryId) && (adult || !i.adult),
  );
}

export function sectionsView(c: TVCatalog, p: TVListPrefs) {
  const sections: Partial<Record<Section, SectionView>> = {};
  for (const s of SECTIONS) {
    if (c[s].items.length === 0) continue;
    const counts = new Map<string, number>();
    for (const i of visibleItems(c, p, s))
      counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1);
    const categories = orderCategories(c[s].categories, p).map((cat) => ({
      id: cat.id,
      name: cat.name,
      ...(cat.country ? { country: cat.country } : {}),
      count: cat.hidden ? 0 : (counts.get(cat.id) ?? 0),
      pinned: cat.pinned,
      hidden: cat.hidden,
    }));
    sections[s] = {
      categories,
      total: categories.reduce((n, cat) => n + cat.count, 0),
      hiddenCount: categories.filter((cat) => cat.hidden).length,
    };
  }
  return { fetchedAt: c.fetchedAt, sections };
}

export function categoryPage(
  c: TVCatalog,
  p: TVListPrefs,
  section: Section,
  categoryId: string,
  page: number,
  size: number,
  filters: {
    q?: string;
    tag?: string;
    favorites?: boolean;
    anchor?: string;
  } = {},
) {
  const cat = c[section].categories.find((x) => x.id === categoryId);
  if (!cat || isCategoryHidden(cat, p)) return undefined;
  const normalize = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-PT");
  const all = visibleItems(c, p, section).filter(
    (i) =>
      i.categoryId === categoryId &&
      (!filters.favorites || p.favorites[section].includes(i.id)) &&
      (!filters.q || normalize(i.name).includes(normalize(filters.q))) &&
      (!filters.tag || ("tags" in i && i.tags.includes(filters.tag as never))),
  );
  const anchor = filters.anchor
    ? all.findIndex((item) => item.id === filters.anchor)
    : -1;
  if (anchor >= 0) page = Math.floor(anchor / size);
  return {
    items: all.slice(page * size, page * size + size).map(publicItem),
    tags: [
      ...new Set(
        visibleItems(c, p, section)
          .filter((i) => i.categoryId === categoryId)
          .flatMap((i) => ("tags" in i ? i.tags : [])),
      ),
    ],
    total: all.length,
    page,
    size,
  };
}

export function searchIndex(
  c: TVCatalog,
  p: TVListPrefs,
): { k: "l" | "m" | "s"; id: string; n: string; c: string }[] {
  return SECTIONS.flatMap((s) => {
    const names = new Map(c[s].categories.map((cat) => [cat.id, cat.name]));
    return visibleItems(c, p, s).map((i) => ({
      k: KIND[s],
      id: i.id,
      n: i.name,
      c: names.get(i.categoryId) ?? "",
    }));
  });
}

export function visibleItem(
  c: TVCatalog,
  p: TVListPrefs,
  section: Section,
  id: string,
): Item | undefined {
  return visibleItems(c, p, section).find((i) => i.id === id);
}
