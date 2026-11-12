import { api } from "../../../shared/services/api";
import type { MotorStatus } from "../models/status";
export function motorStatus(signal?: AbortSignal) {
  return api<MotorStatus>("/motor/status", { signal });
}

/** Starts a member-owned lease and resolves the playable URL in one place. */
export async function startMotor(
  infoHash: string,
  fileIdx?: number,
  options: Pick<RequestInit, "signal" | "keepalive"> = {},
) {
  const result = await api<{
    ok: boolean;
    infoHash: string;
    fileIdx: number;
    url?: string;
  }>("/motor/start", {
    ...options,
    method: "POST",
    body: JSON.stringify({ infoHash, fileIdx }),
  });
  return {
    ...result,
    url: result.url || `/api/motor/stream/${result.infoHash}/${result.fileIdx}`,
  };
}

export function stopMotor(
  infoHash: string,
  options: Pick<RequestInit, "signal" | "keepalive"> = {},
) {
  return api("/motor/stop", {
    ...options,
    method: "POST",
    body: JSON.stringify({ infoHash }),
  });
}
