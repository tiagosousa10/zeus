import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { Account, Upstream } from "../src/modules/iptv/account.js";
import {
  addResource,
  clearSessions,
  createSession,
  endSession,
  findSession,
  setSessionClock,
} from "../src/modules/iptv/sessions.js";

const up: Upstream = { url: "https://cdn.test/a.m3u8", kind: "hls", container: "m3u8" };
const acc: Account = { formats: ["m3u8"] };
let now = 0;

beforeEach(() => {
  now = 1_000_000;
  setSessionClock(() => now);
  clearSessions();
});

test("a new session on the same list ends the previous one first", () => {
  const a = createSession("u1", "l1", up, acc);
  let closed = false;
  a.onEnd.add(() => (closed = true));
  const b = createSession("u1", "l1", up, acc);
  assert.equal(a.signal.aborted, true);
  assert.equal(closed, true);
  assert.equal(findSession(a.token, "u1"), "ended");
  assert.equal(findSession(b.token, "u1"), b);
});

test("tokens are private to their member", () => {
  const s = createSession("u1", "l2", up, acc);
  assert.match(s.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(findSession(s.token, "u2"), undefined);
  assert.equal(findSession("nope", "u1"), undefined);
  endSession(s);
  assert.equal(findSession(s.token, "u2"), undefined);
});

test("resource map is capped at 2000 entries and ids are sequential", () => {
  const s = createSession("u1", "l3", up, acc);
  const first = addResource(s, "https://cdn.test/0.ts");
  const second = addResource(s, "https://cdn.test/1.ts");
  assert.notEqual(first, second);
  let last = "";
  for (let i = 2; i < 2100; i++) last = addResource(s, `https://cdn.test/${i}.ts`);
  assert.equal(s.resources.size, 2000);
  assert.equal(s.resources.has(first), false);
  assert.equal(s.resources.get(last), "https://cdn.test/2099.ts");
});

test("idle sessions end after 2 h and findSession keeps active ones alive", () => {
  const idle = createSession("u1", "l4", up, acc);
  const busy = createSession("u1", "l5", up, acc);
  now += 90 * 60_000;
  assert.equal(findSession(busy.token, "u1"), busy);
  now += 90 * 60_000;
  assert.equal(findSession(idle.token, "u1"), "ended");
  assert.equal(findSession(busy.token, "u1"), busy);
  now += 2 * 3_600_000 + 1;
  assert.equal(findSession(busy.token, "u1"), "ended");
});

test("ended sessions are forgotten after 10 min", () => {
  const s = createSession("u1", "l6", up, acc);
  endSession(s);
  now += 10 * 60_000 - 1;
  assert.equal(findSession(s.token, "u1"), "ended");
  now += 2;
  assert.equal(findSession(s.token, "u1"), undefined);
});

test("onEnd callbacks run once, survive exceptions, and endSession is idempotent", () => {
  const s = createSession("u1", "l7", up, acc);
  let n = 0;
  s.onEnd.add(() => {
    throw new Error("boom");
  });
  s.onEnd.add(() => n++);
  endSession(s);
  endSession(s);
  assert.equal(n, 1);
  assert.equal(s.ended, true);
  assert.equal(s.signal.aborted, true);
});

test("the same URL keeps its resource id, also after the cap evicts others", () => {
  const s = createSession("u1", "l4", up, acc);
  const id = addResource(s, "https://cdn.test/v.m3u8");
  assert.equal(addResource(s, "https://cdn.test/v.m3u8"), id);
  for (let i = 0; i < 2100; i++) addResource(s, `https://cdn.test/${i}.ts`);
  assert.equal(s.resources.size, 2000);
  const again = addResource(s, "https://cdn.test/0.ts");
  assert.notEqual(again, addResource(s, "https://cdn.test/1999.ts"));
  assert.equal(s.resources.get(again), "https://cdn.test/0.ts");
  assert.equal(s.resources.size, 2000);
});

test("playlist marks follow their resource and leave with the cap", () => {
  const s = createSession("u1", "l5", up, acc);
  addResource(s, "https://cdn.test/v.m3u8", true);
  addResource(s, "https://cdn.test/seg.ts");
  assert.deepEqual([...s.playlists], ["https://cdn.test/v.m3u8"]);
  for (let i = 0; i < 2000; i++) addResource(s, `https://cdn.test/${i}.ts`);
  assert.equal(s.playlists.size, 0);
});

test("members with the same private list id do not end each other's playback", () => {
  const a = createSession("u1", "imported-list", up, acc);
  const b = createSession("u2", "imported-list", up, acc);
  assert.equal(a.signal.aborted, false);
  assert.equal(findSession(a.token, "u1"), a);
  assert.equal(findSession(b.token, "u2"), b);
  endSession(b);
  assert.equal(a.signal.aborted, false);
});

test("clearing sessions aborts active streams and runs cleanup once", () => {
  const s = createSession("u1", "l1", up, acc);
  let cleanups = 0;
  s.onEnd.add(() => cleanups++);
  clearSessions();
  clearSessions();
  assert.equal(s.signal.aborted, true);
  assert.equal(cleanups, 1);
  assert.equal(findSession(s.token, "u1"), undefined);
});
