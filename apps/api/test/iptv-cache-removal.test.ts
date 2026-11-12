import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.ZEUS_DATA_DIR = mkdtempSync(join(tmpdir(), "zeus-cache-removal-"));
delete process.env.DATABASE_URL;
const { db, closeDatabase } = await import("../src/db/client.js");
const { user } = await import("../src/db/schema.js");
const { patchState } = await import("../src/modules/member/service.js");
const { getCatalog, clearMemoryCache } =
  await import("../src/modules/iptv/services/cache.js");
const { setProviderFetch } =
  await import("../src/modules/iptv/services/provider.js");
const list = {
  id: "list",
  name: "Test",
  type: "m3u" as const,
  url: "https://example.test/list",
};
const body =
  '#EXTM3U\n#EXTINF:-1 group-title="TV",Channel\nhttps://example.test/live.ts\n';
const files = () => {
  const p = join(process.env.ZEUS_DATA_DIR!, "iptv-cache");
  return existsSync(p) ? readdirSync(p).filter((f) => f.endsWith(".bin")) : [];
};
after(closeDatabase);
async function member(id: string) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.test`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await patchState(id, { iptv: [list] }, true);
}
test("removing a list from saved member state removes its persistent catalog", async () => {
  await member("delete");
  setProviderFetch(async () => new Response(body));
  await getCatalog("delete", list);
  assert.equal(files().length, 1);
  await patchState("delete", { iptv: [] }, true);
  assert.deepEqual(files(), []);
});
test("a load already in flight cannot resurrect a deleted list cache", async () => {
  await member("race");
  clearMemoryCache();
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const wait = new Promise<void>((r) => {
    release = r;
  });
  setProviderFetch(async () => {
    started();
    await wait;
    return new Response(body);
  });
  const load = getCatalog("race", list);
  await ready;
  await patchState("race", { iptv: [] }, true);
  release();
  await load;
  assert.deepEqual(files(), []);
});

test("removal during catalog lookup cannot start a later movie or series cache write", async () => {
  const { getMovie, getSeries } =
    await import("../src/modules/iptv/services/cache.js");
  const { xtreamRoutes } = await import("./fixtures/xtream.js");
  for (const [kind, lookup, itemId] of [
    ["movie", getMovie, "201"],
    ["series", getSeries, "301"],
  ] as const) {
    const owner = `detail-${kind}`;
    await member(owner);
    const xtream = {
      ...list,
      type: "xtream" as const,
      username: "fixture",
      password: "fixture",
    };
    await patchState(owner, { iptv: [xtream] }, true);
    let release!: () => void, started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    setProviderFetch(async (input) => {
      started();
      await wait;
      return Response.json(xtreamRoutes(new URL(String(input))));
    });
    const pending = lookup(owner, xtream, itemId);
    await ready;
    await patchState(owner, { iptv: [] }, true);
    release();
    await pending;
    assert.deepEqual(files(), []);
  }
});

test("invalidating one member list preserves another member memory-only account cache", async () => {
  const { getAccount } = await import("../src/modules/iptv/services/cache.js");
  const { fakeFetch, xtreamRoutes } = await import("./fixtures/xtream.js");
  await member("changed");
  const xtream = {
    ...list,
    type: "xtream" as const,
    username: "fixture",
    password: "fixture",
  };
  setProviderFetch(fakeFetch(xtreamRoutes));
  const before = await getAccount("unrelated", xtream);
  const otherList = { ...xtream, id: "other-list" };
  const sameMember = await getAccount("changed", otherList);
  await patchState("changed", { iptv: [] }, true);
  setProviderFetch(async () => {
    throw new Error("should use the unrelated member cache");
  });
  assert.deepEqual(await getAccount("unrelated", xtream), before);
  assert.deepEqual(await getAccount("changed", otherList), sameMember);
});
