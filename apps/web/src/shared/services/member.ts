import { api } from "./api";
import type { Member, MemberState } from "../models/member";
import type { IPTVListUpdate } from "../../../../../packages/contracts/member";

export function loadSession(signal?: AbortSignal) {
  return api<{ user: Member | null }>("/session", { signal });
}

export function loadMemberState(signal?: AbortSignal) {
  return api<MemberState>("/state", { signal });
}

/** The same state contract supports ordinary saves and the final pagehide flush. */
export function saveMemberState(
  patch: Partial<MemberState<IPTVListUpdate>>,
  options: Pick<RequestInit, "signal" | "keepalive"> = {},
) {
  return api<MemberState>("/state", {
    ...options,
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
