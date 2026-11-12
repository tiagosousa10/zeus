import { flushSync } from "react-dom";
import type { SearchEntry, TVListPrefs } from "./types";
export function recentItems<
  T extends { id: string; name: string; added?: number },
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (b.added || 0) - (a.added || 0) ||
      a.name.localeCompare(b.name, "pt") ||
      a.id.localeCompare(b.id),
  );
}
export function orderedEpisodes<
  T extends { season: number; number: number; id: string },
>(episodes: T[]): T[] {
  return [...episodes].sort(
    (a, b) =>
      a.season - b.season || a.number - b.number || a.id.localeCompare(b.id),
  );
}
export function continueItems(
  index: SearchEntry[],
  progress: TVListPrefs["progress"],
  section: "movie" | "series",
) {
  const kind = section === "movie" ? "m" : "s";
  const visible = new Map(
    index.filter((x) => x.k === kind).map((x) => [x.id, x]),
  );
  return Object.entries(progress)
    .flatMap(([key, p]) => {
      const [type, id, episodeId] = key.split(":");
      const entry = visible.get(id);
      return type === section &&
        entry &&
        p.duration > 0 &&
        p.position > 0 &&
        p.position / p.duration < 0.95 &&
        (section !== "series" || episodeId)
        ? [{ key, entry, episodeId, progress: p }]
        : [];
    })
    .sort((a, b) => b.progress.updatedAt - a.progress.updatedAt);
}
export function openWithTransition(action: () => void) {
  const doc = document as Document & {
    startViewTransition?: (fn: () => void) => unknown;
  };
  if (
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    doc.startViewTransition
  )
    doc.startViewTransition(() => flushSync(action));
  else action();
}

export function resumePosition(progress?: TVListPrefs["progress"][string]) {
  return progress &&
    progress.duration > 0 &&
    progress.position / progress.duration < 0.95
    ? Math.max(0, progress.position)
    : 0;
}
