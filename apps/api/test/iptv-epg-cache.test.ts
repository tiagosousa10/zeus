import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IPTVList } from "../../../packages/contracts/iptv.js";
process.env.ZEUS_DATA_DIR = mkdtempSync(join(tmpdir(), "zeus-epg-cache-"));
const { getGuide, clearMemoryCache, setClock } =
  await import("../src/modules/iptv/services/cache.js");
const { setGuideFetch } = await import("../src/modules/iptv/services/epg.js");
const list: IPTVList = {
  id: "l1",
  name: "Casa",
  type: "m3u",
  url: "https://tv.test/list",
  epgUrl: "https://guide.test/a",
};
test("guide uses a one-hour memory cache, coalesces loads and isolates list/member/EPG URL", async () => {
  let time = Date.parse("2026-11-12T20:00:00Z"),
    calls = 0;
  setClock(() => time);
  clearMemoryCache();
  setGuideFetch(async () => {
    calls++;
    return new Response(
      `<tv><programme start="20261112200000" stop="20261112210000" channel="a"><title>Edition ${calls}</title></programme></tv>`,
    );
  });
  const [a, b] = await Promise.all([
    getGuide("u1", list),
    getGuide("u1", list),
  ]);
  assert.equal(a.get("a")?.[0].title, "Edition 1");
  assert.equal(b.get("a")?.[0].title, "Edition 1");
  time += 3_600_000 - 1;
  assert.equal((await getGuide("u1", list)).get("a")?.[0].title, "Edition 1");
  time += 2;
  assert.equal((await getGuide("u1", list)).get("a")?.[0].title, "Edition 2");
  assert.equal(
    (await getGuide("u1", { ...list, epgUrl: "https://guide.test/b" })).get(
      "a",
    )?.[0].title,
    "Edition 3",
  );
  assert.equal((await getGuide("u2", list)).get("a")?.[0].title, "Edition 4");
  assert.equal(
    (await getGuide("u1", { ...list, password: "changed" })).get("a")?.[0]
      .title,
    "Edition 5",
  );
  clearMemoryCache();
  assert.equal((await getGuide("u1", list)).get("a")?.[0].title, "Edition 6");
  assert.ok(!readdirSync(process.env.ZEUS_DATA_DIR!).includes("iptv-cache"));
});
