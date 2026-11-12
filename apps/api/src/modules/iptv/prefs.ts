import { z } from "zod";
import type { Section, TVCategory } from "./types.js";

const ids = z.array(z.string()).max(10000);
const perSection = (list: z.ZodType<string[]>) =>
  z.object({ live: list, movie: list, series: list }).strict();

export const tvListPrefs = z
  .object({
    pinned: perSection(ids.max(4)),
    order: perSection(ids),
    hidden: perSection(ids),
    shownAdult: perSection(ids),
    favorites: perSection(ids),
    progress: z
      .record(z.string(), z.object({ position: z.number(), duration: z.number(), updatedAt: z.number() }).strict())
      .refine((r) => Object.keys(r).length <= 5000),
    lastChannel: z.string().optional(),
  })
  .strict();

export const tvPrefs = z
  .record(z.string(), tvListPrefs)
  .refine((r) => Object.keys(r).length <= 100);

export interface TVListPrefs {
  pinned: Record<Section, string[]>;
  order: Record<Section, string[]>;
  hidden: Record<Section, string[]>;
  shownAdult: Record<Section, string[]>;
  favorites: Record<Section, string[]>;
  progress: Record<string, { position: number; duration: number; updatedAt: number }>;
  lastChannel?: string;
}

const empty = (): Record<Section, string[]> => ({ live: [], movie: [], series: [] });

export function defaultPrefs(): TVListPrefs {
  return { pinned: empty(), order: empty(), hidden: empty(), shownAdult: empty(), favorites: empty(), progress: {} };
}

export function prefsFor(state: { tv?: Record<string, unknown> }, listId: string): TVListPrefs {
  const stored = state.tv?.[listId];
  const out = defaultPrefs();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return out;
  const raw = stored as Record<string, unknown>;
  for (const key of ["pinned", "order", "hidden", "shownAdult", "favorites"] as const) {
    const value = raw[key];
    if (!value || typeof value !== "object") continue;
    for (const s of ["live", "movie", "series"] as const) {
      const list = ids.safeParse((value as Record<string, unknown>)[s]);
      if (list.success) out[key][s] = list.data;
    }
  }
  const progress = tvListPrefs.shape.progress.safeParse(raw.progress);
  if (progress.success) out.progress = progress.data;
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

export function orderCategories(cs: TVCategory[], p: TVListPrefs): (TVCategory & { pinned: boolean; hidden: boolean })[] {
  const rank = (c: TVCategory) => {
    const pin = p.pinned[c.section].indexOf(c.id);
    if (pin >= 0) return pin;
    const pos = p.order[c.section].indexOf(c.id);
    return pos >= 0 ? 1000 + pos : Number.MAX_SAFE_INTEGER;
  };
  return cs
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ c }) => ({ ...c, pinned: p.pinned[c.section].includes(c.id), hidden: isCategoryHidden(c, p) }));
}
