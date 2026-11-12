import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeFetch, xtreamRoutes } from "./fixtures/xtream.js";
import type { IPTVList } from "../src/modules/iptv/types.js";

process.env.ZEUS_DATA_DIR = mkdtempSync(join(tmpdir(), "zeus-iptv-cache-"));
const { config } = await import("../src/lib/config.js");
const { setProviderFetch } = await import("../src/modules/iptv/provider.js");
const { getCatalog, getMovie, getSeries, setClock, clearMemoryCache } = await import("../src/modules/iptv/cache.js");
const dataDir = config.dataDir;

const list: IPTVList = { id: "l1", name: "Casa", type: "xtream", url: "https://tv.example.test/", username: "u", password: "segredo-123" };

test("catalog is cached for 6 h and refreshed on force", async () => {
  let t = 0; setClock(() => t);
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  await getCatalog("u1", list); await getCatalog("u1", list);
  assert.equal(f.calls.length, 6);
  t += 6 * 3600_000 - 1; await getCatalog("u1", list); assert.equal(f.calls.length, 6);
  t += 2; await getCatalog("u1", list); assert.equal(f.calls.length, 12);
  await getCatalog("u1", list, { force: true }); assert.equal(f.calls.length, 18);
});
test("concurrent loads share one provider load", async () => {
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  await Promise.all([getCatalog("u2", list), getCatalog("u2", list), getCatalog("u2", list)]);
  assert.equal(f.calls.length, 6);
});
test("changing credentials with the same list id bypasses the cache", async () => {
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  await getCatalog("u3", list); await getCatalog("u3", { ...list, password: "other" });
  assert.equal(f.calls.length, 12);
});
test("disk cache survives a restart and holds no credentials in clear", async () => {
  setProviderFetch(fakeFetch(xtreamRoutes)); await getCatalog("u4", list);
  const files = readdirSync(join(dataDir, "iptv-cache"));
  assert.ok(files.length > 0);
  for (const name of files) assert.ok(!readFileSync(join(dataDir, "iptv-cache", name), "utf8").includes(list.password!));
  clearMemoryCache(); const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  await getCatalog("u4", list); assert.equal(f.calls.length, 0);
});
test("wrong Xtream credentials are an error, not an empty list", async () => {
  setProviderFetch(fakeFetch(() => ({ user_info: { auth: 0 } })));
  await assert.rejects(getCatalog("u5", list), /recusou o utilizador ou a palavra-passe/);
});
test("provider failure messages never contain the list URL or password", async () => {
  setProviderFetch(async () => { throw new Error("connect ECONNREFUSED " + list.url); });
  await assert.rejects(getCatalog("u6", list), (e: Error) => !e.message.includes(list.password!) && !e.message.includes("tv.example.test"));
});
test("Xtream details are fetched once and unknown ids are undefined", async () => {
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  const movie = await getMovie("u7", list, "201");
  assert.equal(movie?.plot, "Uma história.");
  assert.equal(f.calls.at(-1)?.searchParams.get("vod_id"), "201");
  const series = await getSeries("u7", list, "301");
  assert.equal(series?.seasons.length, 2);
  assert.equal(f.calls.at(-1)?.searchParams.get("series_id"), "301");
  const calls = f.calls.length;
  await getMovie("u7", list, "201"); await getSeries("u7", list, "301");
  assert.equal(f.calls.length, calls);
  assert.equal(await getMovie("u7", list, "999"), undefined);
});
test("M3U details come from the catalog without extra requests", async () => {
  const m3u = { id: "l2", name: "M3U", type: "m3u" as const, url: "https://tv.example.test/list.m3u" };
  const text = '#EXTM3U\n#EXTINF:-1 group-title="Filmes",Filme C (2020)\nhttps://tv.example.test/movie/u/p/9.mp4\n';
  const f = fakeFetch(() => new Response(text)); setProviderFetch(f);
  const catalog = await getCatalog("u8", m3u);
  const base = catalog.movie.items[0];
  assert.ok(base);
  assert.deepEqual(await getMovie("u8", m3u, base.id), { ...base, cast: [] });
  assert.equal(f.calls.length, 1);
});
const REFUSED = /recusou o utilizador ou a palavra-passe/;
const UNAVAILABLE = /O fornecedor da lista não respondeu/;
test("auth \"0\" and HTTP 401 are credential errors", async () => {
  setProviderFetch(fakeFetch(() => ({ user_info: { auth: "0" } })));
  await assert.rejects(getCatalog("u9", list), REFUSED);
  setProviderFetch(fakeFetch(() => new Response("", { status: 401 })));
  await assert.rejects(getCatalog("u10", list), REFUSED);
});
test("every Xtream list payload must be an array", async () => {
  const refusedLater = (url: URL) => (url.searchParams.get("action") === "get_vod_streams" ? { user_info: { auth: 0 } } : xtreamRoutes(url));
  setProviderFetch(fakeFetch(refusedLater));
  await assert.rejects(getCatalog("u11", list), REFUSED);
  const objectLater = (url: URL) => (url.searchParams.get("action") === "get_series" ? { error: "x" } : xtreamRoutes(url));
  setProviderFetch(fakeFetch(objectLater));
  await assert.rejects(getCatalog("u12", list), UNAVAILABLE);
});
test("an empty catalog is an error and is not cached", async () => {
  setProviderFetch(fakeFetch(() => []));
  await assert.rejects(getCatalog("u13", list), UNAVAILABLE);
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  assert.equal((await getCatalog("u13", list)).live.items.length, 4);
  const m3u = { id: "l3", name: "M3U", type: "m3u" as const, url: "https://tv.example.test/empty.m3u" };
  setProviderFetch(fakeFetch(() => new Response("#EXTM3U\n")));
  await assert.rejects(getCatalog("u13", m3u), UNAVAILABLE);
});
test("disk files from an older cache format are ignored", async () => {
  const { createHash } = await import("node:crypto");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { encrypt } = await import("../src/lib/crypto.js");
  const oldKey = createHash("sha256").update(["u14", list.id, list.type, list.url, list.username, list.password].join("|")).digest("hex");
  mkdirSync(join(dataDir, "iptv-cache"), { recursive: true });
  writeFileSync(join(dataDir, "iptv-cache", `${oldKey}.bin`), encrypt({ value: { old: true }, expires: Number.MAX_SAFE_INTEGER }));
  setClock(() => 0); clearMemoryCache();
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  assert.equal((await getCatalog("u14", list)).live.items.length, 4);
  assert.equal(f.calls.length, 6);
});
