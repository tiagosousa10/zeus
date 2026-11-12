import type { Section, TVCategory } from "./iptv.js";

export interface TVListPrefs {
  pinned: Record<Section, string[]>;
  order: Record<Section, string[]>;
  hidden: Record<Section, string[]>;
  shownAdult: Record<Section, string[]>;
  favorites: Record<Section, string[]>;
  progress: Record<
    string,
    { position: number; duration: number; updatedAt: number }
  >;
  lastChannel?: string;
}

const empty = (): Record<Section, string[]> => ({
  live: [],
  movie: [],
  series: [],
});

export function defaultPrefs(): TVListPrefs {
  return {
    pinned: empty(),
    order: empty(),
    hidden: empty(),
    shownAdult: empty(),
    favorites: empty(),
    progress: {},
  };
}

export function prefsFor(
  state: { tv?: Record<string, unknown> },
  listId: string,
): TVListPrefs {
  const stored = state.tv?.[listId];
  const out = defaultPrefs();
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    return out;
  const raw = stored as Record<string, unknown>;
  for (const key of [
    "pinned",
    "order",
    "hidden",
    "shownAdult",
    "favorites",
  ] as const) {
    const value = raw[key];
    if (!value || typeof value !== "object") continue;
    for (const s of ["live", "movie", "series"] as const) {
      const list = (value as Record<string, unknown>)[s];
      if (
        Array.isArray(list) &&
        list.length <= 10000 &&
        list.every((id) => typeof id === "string")
      )
        out[key][s] = [...list];
    }
  }
  const progress = raw.progress;
  if (
    progress &&
    typeof progress === "object" &&
    !Array.isArray(progress) &&
    Object.keys(progress).length <= 5000
  ) {
    const entries = Object.entries(progress);
    if (
      entries.every(
        ([, p]) =>
          p &&
          typeof p === "object" &&
          !Array.isArray(p) &&
          Object.keys(p).length === 3 &&
          ["position", "duration", "updatedAt"].every(
            (key) => typeof p[key] === "number" && Number.isFinite(p[key]),
          ),
      )
    )
      out.progress = Object.fromEntries(
        entries.map(([id, p]) => [
          id,
          {
            position: p.position,
            duration: p.duration,
            updatedAt: p.updatedAt,
          },
        ]),
      );
  }
  if (typeof raw.lastChannel === "string") out.lastChannel = raw.lastChannel;
  return out;
}

export function isCategoryHidden(c: TVCategory, p: TVListPrefs): boolean {
  if (p.hidden[c.section].includes(c.id)) return true;
  return c.adult && !p.shownAdult[c.section].includes(c.id);
}

export function adultItemsVisible(cs: TVCategory[], p: TVListPrefs): boolean {
  return cs.some((c) => c.adult && !isCategoryHidden(c, p));
}

export function orderCategories(
  cs: TVCategory[],
  p: TVListPrefs,
): (TVCategory & { pinned: boolean; hidden: boolean })[] {
  const rank = (c: TVCategory) => {
    const pin = p.pinned[c.section].indexOf(c.id);
    if (pin >= 0) return pin;
    const pos = p.order[c.section].indexOf(c.id);
    return pos >= 0 ? 1000 + pos : Number.MAX_SAFE_INTEGER;
  };
  return cs
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ c }) => ({
      ...c,
      pinned: p.pinned[c.section].includes(c.id),
      hidden: isCategoryHidden(c, p),
    }));
}
