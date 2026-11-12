import { randomBytes } from "node:crypto";
import type { Account, Upstream } from "./account.js";

export interface PlaySession {
  token: string;
  userId: string;
  listId: string;
  upstream: Upstream;
  account: Account;
  signal: AbortSignal;
  ended: boolean;
  resources: Map<string, string>;
  onEnd: Set<() => void>;
}

const IDLE_MS = 2 * 3_600_000;
const ENDED_KEEP_MS = 10 * 60_000;
const MAX_RESOURCES = 2000;

interface Entry {
  session: PlaySession;
  controller: AbortController;
  lastSeen: number;
  endedAt?: number;
  nextResource: number;
  resourceIds: Map<string, string>;
}

const entries = new Map<string, Entry>();
let clock: () => number = Date.now;

export function setSessionClock(f: () => number): void {
  clock = f;
}

export function clearSessions(): void {
  entries.clear();
}

function finish(e: Entry): void {
  const s = e.session;
  if (s.ended) return;
  s.ended = true;
  e.endedAt = clock();
  e.controller.abort();
  const callbacks = [...s.onEnd];
  s.onEnd.clear();
  for (const cb of callbacks) {
    try {
      cb();
    } catch {}
  }
}

function sweep(): void {
  const now = clock();
  for (const [token, e] of entries) {
    if (!e.session.ended && now - e.lastSeen > IDLE_MS) finish(e);
    if (e.endedAt !== undefined && now - e.endedAt >= ENDED_KEEP_MS) entries.delete(token);
  }
}

export function createSession(userId: string, listId: string, upstream: Upstream, account: Account): PlaySession {
  sweep();
  for (const e of entries.values()) if (!e.session.ended && e.session.listId === listId) finish(e);
  const controller = new AbortController();
  const session: PlaySession = {
    token: randomBytes(32).toString("base64url"),
    userId,
    listId,
    upstream,
    account,
    signal: controller.signal,
    ended: false,
    resources: new Map(),
    onEnd: new Set(),
  };
  entries.set(session.token, { session, controller, lastSeen: clock(), nextResource: 0, resourceIds: new Map() });
  return session;
}

export function findSession(token: string, userId: string): PlaySession | undefined | "ended" {
  sweep();
  const e = entries.get(token);
  if (!e || e.session.userId !== userId) return undefined;
  if (e.session.ended) return "ended";
  e.lastSeen = clock();
  return e.session;
}

export function endSession(s: PlaySession): void {
  const e = entries.get(s.token);
  if (e) finish(e);
}

// A known URL keeps its id and moves to the newest end, so the cap evicts what is no longer used.
export function addResource(s: PlaySession, url: string): string {
  const e = entries.get(s.token);
  const known = e?.resourceIds.get(url);
  if (known !== undefined) {
    s.resources.delete(known);
    s.resources.set(known, url);
    return known;
  }
  const id = String(e ? e.nextResource++ : s.resources.size);
  s.resources.set(id, url);
  e?.resourceIds.set(url, id);
  if (s.resources.size > MAX_RESOURCES) {
    const [oldId, oldUrl] = s.resources.entries().next().value as [string, string];
    s.resources.delete(oldId);
    e?.resourceIds.delete(oldUrl);
  }
  return id;
}
