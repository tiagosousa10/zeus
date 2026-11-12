import { api } from "../../../shared/services/api";
import type { Subtitle } from "../models/media";
import type { MotorStats } from "../models/playback";
export function loadSubtitles(
  videoId: string,
  type: string,
  signal?: AbortSignal,
) {
  return api<{ subtitles: Subtitle[] }>(
    `/subtitles?${new URLSearchParams({ id: videoId, type })}`,
    { signal },
  );
}

export function motorStatistics(infoHash: string) {
  return api<MotorStats>(`/motor/status?hash=${infoHash}`);
}
