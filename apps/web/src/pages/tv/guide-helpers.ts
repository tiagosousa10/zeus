import type { Programme } from "./types";
export const localDayKey = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export function civilDate(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}
export function shiftLocalDay(day: string, delta: number) {
  const date = civilDate(day);
  date.setDate(date.getDate() + delta);
  return localDayKey(date.getTime());
}
export function localDayBounds(day: string) {
  const date = civilDate(day),
    from = date.getTime();
  date.setDate(date.getDate() + 1);
  return { from, to: date.getTime() };
}
export function guideWindows(from: number, to: number) {
  const windows: { from: number; to: number }[] = [];
  for (let start = from; start < to; start += 86400000)
    windows.push({ from: start, to: Math.min(to, start + 86400000) });
  return windows;
}
export interface GuideGrid {
  availableDays?: string[];
  availability?: { from: number; to: number; timezone: string };
  channels: {
    id: string;
    name: string;
    logo?: string;
    number?: number;
    categoryId: string;
    programmes: Programme[];
  }[];
  total: number;
  size: number;
  page: number;
}
/** DST fall-back uses two requests for the same bounded rows, deduplicating cross-window programmes. */
export function mergeGuideWindows(grids: GuideGrid[]): GuideGrid {
  const first = grids[0];
  return {
    ...first,
    availableDays: [
      ...new Set(grids.flatMap((g) => g.availableDays ?? [])),
    ].sort(),
    channels: first.channels.map((channel) => {
      const programmes = grids.flatMap(
        (g) => g.channels.find((c) => c.id === channel.id)?.programmes ?? [],
      );
      return {
        ...channel,
        programmes: [
          ...new Map(
            programmes.map((p) => [
              `${p.channel ?? ""}:${p.start}:${p.stop}:${p.title}`,
              p,
            ]),
          ).values(),
        ].sort((a, b) => a.start - b.start),
      };
    }),
  };
}
