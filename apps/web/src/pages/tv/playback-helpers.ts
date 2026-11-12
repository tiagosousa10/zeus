export interface PlaybackSession {
  token: string;
  type: "hls" | "mpegts" | "mp4";
  url: string;
  remux: boolean;
}
export const progressKey = (t: {
  section: string;
  id: string;
  episodeId?: string;
}) => `${t.section}:${t.id}${t.episodeId ? ":" + t.episodeId : ""}`;
export function playbackPosition(relative: number, base: number) {
  return Math.max(0, (Number.isFinite(relative) ? relative : 0) + base);
}
export function playbackDuration(
  native: number,
  known: number,
  base = 0,
  remux = false,
) {
  if (remux && Number.isFinite(known) && known > 0) return known;
  return Number.isFinite(native) && native > 0 ? native + base : known;
}
// Starts complete in order even when a view is replaced while the POST is in flight.
let tail: Promise<unknown> = Promise.resolve();
export function serializeStart<T>(start: () => Promise<T>): Promise<T> {
  const next = tail.then(start, start);
  tail = next.catch(() => {});
  return next;
}
