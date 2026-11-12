import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import {
  createSession,
  endSession,
} from "../src/modules/iptv/services/sessions.js";
import {
  startBridge,
  remux,
  remuxSession,
  RemuxBusyError,
} from "../src/modules/iptv/services/remux.js";

const dir = mkdtempSync(join(tmpdir(), "zeus-remux-"));
execFileSync(ffmpeg!, [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc=duration=2:size=160x120:rate=10",
  "-f",
  "lavfi",
  "-i",
  "sine=duration=2",
  "-c:v",
  "mpeg4",
  "-c:a",
  "ac3",
  join(dir, "test.mkv"),
]);
const bytes = readFileSync(join(dir, "test.mkv"));
test.after(() => rmSync(dir, { recursive: true, force: true }));

const session = () =>
  createSession(
    "u",
    "l",
    {
      url: "https://provider.test/private.mkv",
      kind: "file",
      container: "mkv",
    },
    { formats: [] },
  );
const open = async (range?: string) => {
  const offset = Number(/^bytes=(\d+)-/.exec(range ?? "")?.[1] ?? 0);
  return new Response(bytes.subarray(offset), {
    status: range ? 206 : 200,
    headers: {
      "content-length": String(bytes.length - offset),
      "accept-ranges": "bytes",
      "content-type": "video/x-matroska",
      ...(range
        ? {
            "content-range": `bytes ${offset}-${bytes.length - 1}/${bytes.length}`,
          }
        : {}),
    },
  });
};

test("private bridge forwards Range, denies other paths and closes with the session", async () => {
  const s = session();
  const input = await startBridge(s, open);
  try {
    assert.equal(new URL(input).hostname, "127.0.0.1");
    assert.ok(!input.includes("provider"));
    const partial = await fetch(input, { headers: { range: "bytes=10-" } });
    assert.equal(partial.status, 206);
    assert.deepEqual(
      Buffer.from(await partial.arrayBuffer()),
      bytes.subarray(10),
    );
    assert.equal((await fetch(new URL("/wrong", input))).status, 404);
  } finally {
    endSession(s);
  }
  await assert.rejects(fetch(input));
});

test("ffmpeg remuxes MKV to fragmented MP4 with and without seeking", async () => {
  const s = session();
  const input = await startBridge(s, open);
  try {
    for (const seek of [0, 1]) {
      const result = Buffer.from(
        await new Response(remux(input, seek, s.signal)).arrayBuffer(),
      );
      assert.equal(result.subarray(4, 8).toString(), "ftyp");
      assert.ok(result.includes(Buffer.from("moof")));
    }
  } finally {
    endSession(s);
  }
});

test("aborting remux closes its active input and rejects output promptly", async () => {
  const s = session();
  let opened!: () => void;
  let closed!: () => void;
  const inputOpened = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const inputClosed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const input = await startBridge(
    s,
    async (_range, signal) =>
      new Response(
        new ReadableStream({
          start(controller) {
            opened();
            signal?.addEventListener(
              "abort",
              () => {
                closed();
                controller.error(new Error("aborted"));
              },
              { once: true },
            );
          },
        }),
      ),
  );
  const controller = new AbortController();
  const output = new Response(remux(input, 0, controller.signal)).arrayBuffer();
  await inputOpened;
  const start = Date.now();
  controller.abort();
  await assert.rejects(output);
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      inputClosed,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("input stayed open")), 2000);
      }),
    ]);
    assert.ok(Date.now() - start < 2000);
  } finally {
    clearTimeout(timer!);
    endSession(s);
  }
  await assert.rejects(fetch(input));
});

test("a playlist disguised as MKV cannot make ffmpeg open secondary URLs", async () => {
  const s = session();
  let reads = 0;
  let input = "";
  input = await startBridge(s, async () => {
    reads++;
    if (reads > 1) return new Response(bytes);
    return new Response(
      `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\n${input}\n#EXT-X-ENDLIST\n`,
    );
  });
  try {
    await assert.rejects(new Response(remux(input, 0, s.signal)).arrayBuffer());
    assert.equal(
      reads,
      1,
      "ffmpeg must not follow playlist URLs outside safeStream",
    );
  } finally {
    endSession(s);
  }
});

const pendingInput = async (_range?: string, signal?: AbortSignal) =>
  new Response(
    new ReadableStream({
      start(controller) {
        signal?.addEventListener(
          "abort",
          () => controller.error(new Error("cancelled")),
          { once: true },
        );
      },
    }),
  );
const distinctSession = (userId: string, listId: string) =>
  createSession(
    userId,
    listId,
    {
      url: "https://provider.test/private.mkv",
      kind: "file",
      container: "mkv",
    },
    { formats: [] },
  );

test("one Membro cannot reserve more than two converters and cancellation releases capacity", async () => {
  const sessions = [0, 1, 2].map((i) =>
    distinctSession("limit-member", String(i)),
  );
  const results: Promise<unknown>[] = [];
  try {
    for (const s of sessions.slice(0, 2)) {
      const stream = await remuxSession(s, 0, s.signal, pendingInput);
      results.push(new Response(stream).arrayBuffer().catch(() => {}));
    }
    await assert.rejects(
      remuxSession(sessions[2], 0, sessions[2].signal, pendingInput),
      RemuxBusyError,
    );
    endSession(sessions[0]);
    await results[0];
    const output = await remuxSession(sessions[2], 0, sessions[2].signal, open);
    assert.equal(
      Buffer.from(await new Response(output).arrayBuffer())
        .subarray(4, 8)
        .toString(),
      "ftyp",
    );
  } finally {
    sessions.forEach(endSession);
    await Promise.all(results);
  }
});

test("the global converter limit applies across different Membros", async () => {
  const sessions = Array.from({ length: 9 }, (_, i) =>
    distinctSession(`global-${i}`, "list"),
  );
  const results: Promise<unknown>[] = [];
  try {
    for (const s of sessions.slice(0, 8)) {
      const stream = await remuxSession(s, 0, s.signal, pendingInput);
      results.push(new Response(stream).arrayBuffer().catch(() => {}));
    }
    await assert.rejects(
      remuxSession(sessions[8], 0, sessions[8].signal, pendingInput),
      RemuxBusyError,
    );
  } finally {
    sessions.forEach(endSession);
    await Promise.all(results);
  }
});

test("seeking immediately after cancelling the previous remux waits for its converter to exit", async () => {
  const s = distinctSession("seeking", "list");
  const pending: Promise<unknown>[] = [];
  try {
    const previous = await remuxSession(s, 0, s.signal, pendingInput);
    await previous.cancel();
    const seek = remuxSession(s, 1, s.signal, open);
    pending.push(seek);
    let duplicateState = "pending";
    const duplicate = remuxSession(s, 1, s.signal, open).then(
      async (stream) => {
        duplicateState = "accepted";
        await stream.cancel();
      },
      (error) => {
        duplicateState = error instanceof RemuxBusyError ? "busy" : "error";
      },
    );
    pending.push(duplicate);
    await Promise.resolve();
    assert.equal(
      duplicateState,
      "busy",
      "only one replacement may wait for the old process",
    );
    const next = await seek;
    const result = Buffer.from(await new Response(next).arrayBuffer());
    assert.equal(result.subarray(4, 8).toString(), "ftyp");
    await duplicate;
  } finally {
    endSession(s);
    await Promise.allSettled(pending);
  }
});

test("a seek arriving before the old HTTP cancellation waits without starting a second converter", async () => {
  const s = distinctSession("seek-race", "list");
  let replacement: Promise<ReadableStream<Uint8Array>> | undefined;
  try {
    const previous = await remuxSession(s, 0, s.signal, pendingInput);
    replacement = remuxSession(s, 1, s.signal, open);
    void replacement.catch(() => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    await previous.cancel();
    const output = await replacement;
    assert.equal(
      Buffer.from(await new Response(output).arrayBuffer())
        .subarray(4, 8)
        .toString(),
      "ftyp",
    );
  } finally {
    endSession(s);
    await replacement?.catch(() => {});
  }
});

test("cancelling a waiting seek frees the waiter without stopping the current conversion", async () => {
  const s = distinctSession("seek-wait-cancel", "list");
  let replacement: Promise<ReadableStream<Uint8Array>> | undefined;
  try {
    const previous = await remuxSession(s, 0, s.signal, pendingInput);
    const abandoned = new AbortController();
    const waiting = remuxSession(s, 1, abandoned.signal, open);
    abandoned.abort();
    await assert.rejects(waiting, /cancelada/);
    replacement = remuxSession(s, 1, s.signal, open);
    void replacement.catch(() => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    await previous.cancel();
    assert.equal(
      Buffer.from(await new Response(await replacement).arrayBuffer())
        .subarray(4, 8)
        .toString(),
      "ftyp",
    );
  } finally {
    endSession(s);
    await replacement?.catch(() => {});
  }
});

test("live compatibility transcodes TS video and audio to bounded H264/AAC that decodes", async () => {
  const source = execFileSync(
    ffmpeg!,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=1:size=1440x1080:rate=25",
      "-f",
      "lavfi",
      "-i",
      "sine=duration=1",
      "-c:v",
      "mpeg2video",
      "-threads",
      "2",
      "-c:a",
      "mp2",
      "-f",
      "mpegts",
      "pipe:1",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const s = distinctSession("compatible", "live");
  try {
    const output = await remuxSession(
      s,
      0,
      s.signal,
      async () => new Response(source),
      { transcodeVideo: true },
    );
    const converted = Buffer.from(await new Response(output).arrayBuffer());
    const decoded = spawnSync(
      ffmpeg!,
      ["-hide_banner", "-i", "pipe:0", "-f", "null", "-"],
      { input: converted, encoding: "utf8" },
    );
    assert.equal(decoded.status, 0, decoded.stderr);
    assert.match(decoded.stderr, /Video: h264/);
    assert.match(decoded.stderr, /Audio: aac/);
    assert.match(decoded.stderr, /yuv420p.*1280x960/);
    assert.match(decoded.stderr, /25 fps/);
  } finally {
    endSession(s);
  }
});

test("compatibility keeps the demuxer restriction against disguised HLS", async () => {
  const s = distinctSession("compatible-hls", "live");
  let reads = 0;
  try {
    const output = await remuxSession(
      s,
      0,
      s.signal,
      async () => {
        reads++;
        return new Response(
          "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nhttp://127.0.0.1:1/private\n#EXT-X-ENDLIST\n",
        );
      },
      { transcodeVideo: true },
    );
    await assert.rejects(new Response(output).arrayBuffer());
    assert.equal(reads, 1);
  } finally {
    endSession(s);
  }
});
