import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaybackRecovery } from "../apps/web/src/pages/tv/recovery";
test("five retries, duplicate failures coalesce, playback cancels pending retry", () => {
  const queued: (() => void)[] = [];
  const retries: number[] = [];
  const schedule = (f: () => void) => {
    queued.push(f);
    return () => {
      const i = queued.indexOf(f);
      if (i >= 0) queued.splice(i, 1);
    };
  };
  const recovery = new PlaybackRecovery((n) => retries.push(n), schedule);
  for (let n = 1; n <= 5; n++) {
    assert.equal(recovery.fail(), true);
    recovery.fail();
    assert.equal(queued.length, 1);
    queued.shift()!();
  }
  assert.deepEqual(retries, [1, 2, 3, 4, 5]);
  assert.equal(recovery.fail(), false);
  recovery.reset();
  recovery.fail();
  recovery.playing();
  assert.equal(queued.length, 0);
  recovery.fail();
  recovery.dispose();
  assert.equal(queued.length, 0);
});

test("default scheduler starts and can be cancelled without retaining timers", () => {
  const recovery = new PlaybackRecovery(() =>
    assert.fail("disposed retry fired"),
  );
  assert.equal(recovery.fail(), true);
  recovery.dispose();
});
