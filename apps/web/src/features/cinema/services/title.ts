import { api } from "../../../shared/services/api";
import type { StreamResponse } from "../models/media";
export function loadSources(
  type: string,
  videoId: string,
  signal?: AbortSignal,
) {
  return api<StreamResponse>(
    `/streams?${new URLSearchParams({ type, id: videoId })}`,
    { signal },
  );
}
