import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Missing eviction, expiry, or serialization must leave observable excess files/data.
async function fixture() {
  const { DiskCache } =
    await import("../src/modules/iptv/services/disk-cache.js");
  const dir = await mkdtemp(join(tmpdir(), "zeus-disk-test-"));
  let now = 100;
  const cache = new DiskCache(
    dir,
    { totalBytes: 12, memberBytes: 8, totalFiles: 4, memberFiles: 3 },
    () => now,
  );
  return {
    cache,
    dir,
    advance: (t: number) => {
      now = t;
    },
  };
}
test("rotating list ids cannot exceed the member disk budget", async () => {
  const { cache, dir } = await fixture();
  for (let i = 0; i < 10; i++)
    await cache.write("alice", String(i), "catalog", "1234", 1000);
  assert.equal((await readdir(dir)).length, 2);
  assert.equal(await cache.read("alice", "9", "catalog"), "1234");
  assert.equal(await cache.read("alice", "0", "catalog"), undefined);
});
test("global eviction respects recent reads across members", async () => {
  const { cache } = await fixture();
  await cache.write("a", "1", "k", "aaaa", 1000);
  await cache.write("b", "1", "k", "bbbb", 1000);
  await cache.write("c", "1", "k", "cccc", 1000);
  assert.equal(await cache.read("a", "1", "k"), "aaaa");
  await cache.write("d", "1", "k", "dddd", 1000);
  assert.equal(await cache.read("b", "1", "k"), undefined);
  assert.equal(await cache.read("a", "1", "k"), "aaaa");
});
test("expiry and removed lists delete disk files, including after restart", async () => {
  const { cache, dir, advance } = await fixture();
  await cache.write("a", "gone", "k", "aaaa", 150);
  await cache.write("b", "keep", "k", "bbbb", 1000);
  advance(200);
  await cache.prune();
  assert.equal((await readdir(dir)).length, 1);
  const { DiskCache } =
    await import("../src/modules/iptv/services/disk-cache.js");
  const restarted = new DiskCache(
    dir,
    { totalBytes: 12, memberBytes: 8, totalFiles: 4, memberFiles: 3 },
    () => 200,
  );
  assert.equal(await restarted.read("b", "keep", "k"), "bbbb");
  await restarted.removeList("b", "keep");
  assert.deepEqual(await readdir(dir), []);
});
test("concurrent writes and reads stay within quota and leave atomic private files", async () => {
  const { cache, dir } = await fixture();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      cache.write("a", String(i), "k", "abcd", 1000),
    ),
  );
  const results = await Promise.all([
    cache.read("a", "19", "k"),
    cache.removeList("a", "19"),
  ]);
  assert.equal(results[0], "abcd");
  for (const file of await readdir(dir)) {
    assert.ok(file.endsWith(".bin"));
    assert.equal((await stat(join(dir, file))).mode & 0o777, 0o600);
  }
  assert.ok((await readdir(dir)).length <= 2);
});
test("oversized entries and legacy orphan files never bypass the budget", async () => {
  const { cache, dir } = await fixture();
  await writeFile(join(dir, "old.bin"), "legacy");
  await cache.write("a", "1", "k", "x".repeat(9), 1000);
  assert.deepEqual(await readdir(dir), []);
});

test("tiny entries still obey global and per-member file quotas", async () => {
  const { cache, dir } = await fixture();
  for (let i = 0; i < 10; i++)
    await cache.write("a", String(i), "k", "x", 1000);
  assert.equal((await readdir(dir)).length, 3);
  await Promise.all(
    ["b", "c", "d"].map((owner) => cache.write(owner, "1", "k", "x", 1000)),
  );
  assert.equal((await readdir(dir)).length, 4);
});
