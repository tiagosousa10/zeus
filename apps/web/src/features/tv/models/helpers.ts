import type { SearchEntry, TVView, TVListPrefs, Section } from "./types";
export function createSerialUpdater<T, Update = T>(
  read: () => T,
  write: (next: Update) => Promise<T>,
) {
  let queue: Promise<unknown> = Promise.resolve();
  return (fn: (current: T) => Update): Promise<T> => {
    const result = queue.then(() => write(fn(read())));
    queue = result.catch(() => {});
    return result;
  };
}
export const normalizeSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-PT")
    .trim();
export function searchVisible(
  index: SearchEntry[],
  term: string,
  allowed: Set<string>,
  scope?: { k: SearchEntry["k"]; name: string },
) {
  const q = normalizeSearch(term);
  return index
    .filter((x) => allowed.has(x.k + ":" + x.c) || allowed.has(x.c))
    .filter(
      (x) =>
        (!scope || (x.c === scope.name && x.k === scope.k)) &&
        normalizeSearch(x.n).includes(q),
    );
}
export function encodeView(v: TVView) {
  const p = new URLSearchParams();
  p.set("section", v.section);
  if (v.categoryId) p.set("category", v.categoryId);
  if (v.detailId) p.set("detail", v.detailId);
  if (v.guide) p.set("guide", "1");
  return "#" + p;
}
export function decodeView(hash: string): TVView {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const s = p.get("section");
  return {
    section: s === "movie" || s === "series" ? s : "live",
    ...(p.get("category") ? { categoryId: p.get("category")! } : {}),
    ...(p.get("detail") ? { detailId: p.get("detail")! } : {}),
    ...(p.get("guide") === "1" ? { guide: true } : {}),
  };
}
export const sectionNames = {
  live: "Ao vivo",
  series: "Séries",
  movie: "Filmes",
};

export function preferenceChanges(before: TVListPrefs, after: TVListPrefs) {
  const changed = (keys: (keyof TVListPrefs)[]) =>
    keys.some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return {
    visibility: changed(["hidden", "shownAdult"]),
    folders: changed(["pinned", "order"]),
    favorites: changed(["favorites"]),
  };
}
export function togglePinned(
  p: TVListPrefs,
  section: Section,
  id: string,
): TVListPrefs {
  const pinned = p.pinned[section],
    exists = pinned.includes(id);
  if (!exists && pinned.length >= 4)
    throw Error("Podes fixar até quatro pastas por secção.");
  return {
    ...p,
    pinned: {
      ...p.pinned,
      [section]: exists ? pinned.filter((x) => x !== id) : [...pinned, id],
    },
  };
}
export function toggleVisibility(
  p: TVListPrefs,
  section: Section,
  id: string,
  defaultHidden: boolean,
): TVListPrefs {
  const hidden =
    p.hidden[section].includes(id) ||
    (defaultHidden && !p.shownAdult[section].includes(id));
  return {
    ...p,
    hidden: {
      ...p.hidden,
      [section]: hidden
        ? p.hidden[section].filter((x) => x !== id)
        : [...new Set([...p.hidden[section], id])],
    },
    shownAdult: {
      ...p.shownAdult,
      [section]: hidden
        ? [...new Set([...p.shownAdult[section], id])]
        : p.shownAdult[section].filter((x) => x !== id),
    },
  };
}
