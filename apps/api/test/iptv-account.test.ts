import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { normalizeSeriesInfo, normalizeXtreamCatalog } from "../src/modules/iptv/xtream.js";
import { upstreamFor, type Account } from "../src/modules/iptv/account.js";
import { fetchAccount, setProviderFetch } from "../src/modules/iptv/provider.js";
import { safeFetch } from "../src/lib/safe-fetch.js";
import type { IPTVList, TVCatalog } from "../src/modules/iptv/types.js";
import { fakeFetch, xtreamFixture } from "./fixtures/xtream.js";

const list: IPTVList = { id: "l1", name: "L", type: "xtream", url: "https://tv.example.test:8080/x", username: "u", password: "segredo-123" };
const both: Account = { formats: ["m3u8", "ts"] };
const catalog = normalizeXtreamCatalog(xtreamFixture.catalog, 0);
const detail = normalizeSeriesInfo(xtreamFixture.seriesInfo, catalog.series.items[0]);

describe("upstreamFor xtream", () => {
  it("live prefers hls, falls back to ts", () => {
    assert.deepEqual(upstreamFor(list, catalog, undefined, both, { section: "live", id: "101" }), {
      url: "https://tv.example.test:8080/live/u/segredo-123/101.m3u8", kind: "hls", container: "m3u8",
    });
    const ts = upstreamFor(list, catalog, undefined, { formats: ["ts"] }, { section: "live", id: "101" });
    assert.equal(ts?.url, "https://tv.example.test:8080/live/u/segredo-123/101.ts");
    assert.equal(ts?.kind, "ts");
    assert.equal(upstreamFor(list, catalog, undefined, { formats: [] }, { section: "live", id: "101" })?.kind, "hls");
  });
  it("movie and episode use their container", () => {
    const m = upstreamFor(list, catalog, undefined, both, { section: "movie", id: "202" });
    assert.equal(m?.kind, "file");
    assert.equal(m?.container, "mkv");
    assert.equal(m?.url, "https://tv.example.test:8080/movie/u/segredo-123/202.mkv");
    const e = upstreamFor(list, catalog, detail, both, { section: "series", id: "301", episodeId: "4002" });
    assert.equal(e?.url, "https://tv.example.test:8080/series/u/segredo-123/4002.mkv");
  });
  it("encodes credentials and returns undefined for unknown ids", () => {
    const odd = { ...list, username: "a b", password: "p/q" };
    assert.match(upstreamFor(odd, catalog, undefined, both, { section: "live", id: "101" })!.url, /\/live\/a%20b\/p%2Fq\/101/);
    assert.equal(upstreamFor(list, catalog, undefined, both, { section: "live", id: "999" }), undefined);
    assert.equal(upstreamFor(list, catalog, undefined, both, { section: "movie", id: "999" }), undefined);
    assert.equal(upstreamFor(list, catalog, detail, both, { section: "series", id: "301", episodeId: "999" }), undefined);
    assert.equal(upstreamFor(list, catalog, undefined, both, { section: "series", id: "301", episodeId: "4001" }), undefined);
  });
});

describe("upstreamFor m3u", () => {
  const m3uList: IPTVList = { id: "l2", name: "M", type: "m3u", url: "https://m.example.test/list.m3u" };
  const ep = { id: "e1", season: 1, number: 1, title: "E", container: "mkv", source: "https://cdn.test/e1.mkv" };
  const m3u = {
    fetchedAt: 0,
    live: { categories: [], items: [
      { id: "a", categoryId: "x", name: "A", tags: [], adult: false, source: "https://cdn.test/a.ts" },
      { id: "b", categoryId: "x", name: "B", tags: [], adult: false, source: "https://cdn.test/b.m3u8?t=1" },
    ] },
    movie: { categories: [], items: [{ id: "m", categoryId: "x", name: "M", container: "mp4", adult: false, source: "https://cdn.test/m.mp4" }] },
    series: { categories: [], items: [{ id: "s", categoryId: "x", name: "S", adult: false, episodes: [ep] }] },
  } as TVCatalog;
  it("uses source and classifies the kind", () => {
    const up = (t: Parameters<typeof upstreamFor>[4]) => upstreamFor(m3uList, m3u, undefined, { formats: [] }, t);
    assert.deepEqual(up({ section: "live", id: "a" }), { url: "https://cdn.test/a.ts", kind: "ts", container: "ts" });
    assert.equal(up({ section: "live", id: "b" })?.kind, "hls");
    assert.equal(up({ section: "movie", id: "m" })?.kind, "file");
    assert.deepEqual(up({ section: "series", id: "s", episodeId: "e1" }), { url: ep.source, kind: "file", container: "mkv" });
    assert.equal(up({ section: "series", id: "s", episodeId: "zz" }), undefined);
  });
});

describe("fetchAccount", () => {
  afterEach(() => setProviderFetch(safeFetch));
  const body = (auth: unknown) => ({ user_info: { auth, max_connections: "1", active_cons: "0", allowed_output_formats: ["m3u8", "ts"], exp_date: "1800000000" } });
  it("reads limits without an action parameter", async () => {
    const f = fakeFetch(() => body(1));
    setProviderFetch(f);
    assert.deepEqual(await fetchAccount(list), { formats: ["m3u8", "ts"], maxConnections: 1, activeConnections: 0, expiresAt: 1800000000000 });
    assert.equal(f.calls[0].searchParams.has("action"), false);
  });
  it("rejects refused credentials", async () => {
    setProviderFetch(fakeFetch(() => body("0")));
    await assert.rejects(fetchAccount(list), /recusou o utilizador ou a palavra-passe/);
  });
  it("m3u needs no request", async () => {
    const f = fakeFetch(() => body(1));
    setProviderFetch(f);
    assert.deepEqual(await fetchAccount({ ...list, type: "m3u" }), { formats: [] });
    assert.equal(f.calls.length, 0);
  });
});
