import test from "node:test";
import assert from "node:assert/strict";
import {
  playbackPosition,
  playbackDuration,
  progressKey,
  serializeStart,
} from "../apps/web/src/features/tv/models/playback-helpers";
test("remux offset remains absolute and unknown media duration preserves metadata", () => {
  assert.equal(playbackPosition(12, 60), 72);
  assert.equal(playbackPosition(Infinity, 60), 60);
  assert.equal(playbackDuration(Infinity, 5400), 5400);
  assert.equal(playbackDuration(0, 5400), 5400);
  assert.equal(playbackDuration(600, 5400), 600);
  assert.equal(playbackDuration(120, 5400, 60, true), 5400);
  assert.equal(playbackDuration(120, 0, 60, true), 180);
  assert.equal(
    progressKey({ section: "series", id: "x", episodeId: "e" }),
    "series:x:e",
  );
});
test("starts serialize across replacement and rejected request does not poison queue", async () => {
  const seen: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = serializeStart(async () => {
    seen.push("a");
    await gate;
    seen.push("a complete");
    throw Error("cancelled");
  }).catch(() => {});
  const b = serializeStart(async () => {
    seen.push("b");
    return 2;
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(seen, ["a"]);
  release();
  await a;
  assert.equal(await b, 2);
  assert.deepEqual(seen, ["a", "a complete", "b"]);
});
test("aborting an abandoned start releases its queue before provider delay completes", async () => {
  const controller = new AbortController();
  let providerCompleted = false;
  const abandoned = serializeStart(
    () =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          providerCompleted = true;
          resolve();
        }, 1000);
        controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(controller.signal.reason);
          },
          { once: true },
        );
      }),
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 5));
  controller.abort();
  const replacement = serializeStart(async () => "new live");
  assert.equal(await replacement, "new live");
  assert.equal(providerCompleted, false);
  await abandoned;
});
