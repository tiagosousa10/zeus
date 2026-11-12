import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import { createSession, endSession } from "../src/modules/iptv/sessions.js";
import { startBridge, remux } from "../src/modules/iptv/remux.js";

const dir = mkdtempSync(join(tmpdir(), "zeus-remux-"));
execFileSync(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=10", "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "mpeg4", "-c:a", "ac3", join(dir, "test.mkv")]);
const bytes = readFileSync(join(dir, "test.mkv"));
test.after(() => rmSync(dir, { recursive: true, force: true }));

const session = () => createSession("u", "l", { url: "https://provider.test/private.mkv", kind: "file", container: "mkv" }, { formats: [] });
const open = async (range?: string) => {
  const offset = Number(/^bytes=(\d+)-/.exec(range ?? "")?.[1] ?? 0);
  return new Response(bytes.subarray(offset), { status: range ? 206 : 200, headers: {
    "content-length": String(bytes.length - offset), "accept-ranges": "bytes", "content-type": "video/x-matroska",
    ...(range ? { "content-range": `bytes ${offset}-${bytes.length - 1}/${bytes.length}` } : {}),
  } });
};

test("private bridge forwards Range, denies other paths and closes with the session", async () => {
  const s = session();
  const input = await startBridge(s, open);
  try {
    assert.equal(new URL(input).hostname, "127.0.0.1");
    assert.ok(!input.includes("provider"));
    const partial = await fetch(input, { headers: { range: "bytes=10-" } });
    assert.equal(partial.status, 206);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(10));
    assert.equal((await fetch(new URL("/wrong", input))).status, 404);
  } finally { endSession(s); }
  await assert.rejects(fetch(input));
});

test("ffmpeg remuxes MKV to fragmented MP4 with and without seeking", async () => {
  const s = session();
  const input = await startBridge(s, open);
  try {
    for (const seek of [0, 1]) {
      const result = Buffer.from(await new Response(remux(input, seek, s.signal)).arrayBuffer());
      assert.equal(result.subarray(4, 8).toString(), "ftyp");
      assert.ok(result.includes(Buffer.from("moof")));
    }
  } finally { endSession(s); }
});

test("aborting remux closes its active input and rejects output promptly", async () => {
  const s = session();
  let opened!: () => void;
  let closed!: () => void;
  const inputOpened = new Promise<void>(resolve => { opened = resolve; });
  const inputClosed = new Promise<void>(resolve => { closed = resolve; });
  const input = await startBridge(s, async (_range, signal) => new Response(new ReadableStream({
    start(controller) {
      opened();
      signal?.addEventListener("abort", () => { closed(); controller.error(new Error("aborted")); }, { once: true });
    },
  })));
  const controller = new AbortController();
  const output = new Response(remux(input, 0, controller.signal)).arrayBuffer();
  await inputOpened;
  const start = Date.now();
  controller.abort();
  await assert.rejects(output);
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([inputClosed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("input stayed open")), 2000); })]);
    assert.ok(Date.now() - start < 2000);
  } finally { clearTimeout(timer!); endSession(s); }
  await assert.rejects(fetch(input));
});

test("a playlist disguised as MKV cannot make ffmpeg open secondary URLs", async () => {
  const s = session();
  let reads = 0;
  let input = "";
  input = await startBridge(s, async () => {
    reads++;
    if (reads > 1) return new Response(bytes);
    return new Response(`#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\n${input}\n#EXT-X-ENDLIST\n`);
  });
  try {
    await assert.rejects(new Response(remux(input, 0, s.signal)).arrayBuffer());
    assert.equal(reads, 1, "ffmpeg must not follow playlist URLs outside safeStream");
  } finally { endSession(s); }
});
