/** Transport inputs required for media delivery; independent of the HTTP framework. */
export interface PlaybackRequest {
  memberId: string;
  signal: AbortSignal;
  token: string;
  listId: string;
  resourceId: string;
  range?: string;
}
