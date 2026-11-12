/** Expected operation failures; the HTTP adapter chooses their status code. */
export type Failure =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "busy"
  | "upstream"
  | "unavailable"
  | "gone";
export class DomainError extends Error {
  constructor(
    readonly kind: Failure,
    readonly payload: Record<string, unknown>,
  ) {
    super(typeof payload.error === "string" ? payload.error : kind);
    this.name = "DomainError";
  }
}
