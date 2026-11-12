import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeXtreamCatalog, normalizeVodInfo, normalizeSeriesInfo, xtreamUrl } from "../src/modules/iptv/xtream.js";
import { xtreamFixture } from "./fixtures/xtream.js";

test("Xtream catalog is normalized into Zeus sections", () => {
  const c = normalizeXtreamCatalog(xtreamFixture.catalog, 1000);
  assert.equal(c.fetchedAt, 1000);
  assert.deepEqual(c.live.categories.map((x) => [x.id, x.name, x.country, x.adult, x.count]), [
    ["1", "Portugal", "PT", false, 2], ["2", "Adultos", undefined, true, 1], ["3", "Exclusivos", undefined, false, 1],
  ]);
  const rtp = c.live.items.find((x) => x.name === "RTP1 HD")!;
  assert.deepEqual([rtp.id, rtp.categoryId, rtp.number, rtp.epgId, rtp.tags], ["101", "1", 1, "rtp1.pt", ["HD"]]);
  assert.equal(c.live.items.find((x) => x.name === "XXX Gold")!.adult, true);
  const [a, b] = c.movie.items;
  assert.deepEqual([a.rating, a.added, a.container], [undefined, 1700000000, "mp4"]);
  assert.deepEqual([b.rating, b.container], [7.6, "mkv"]);
  assert.equal(c.series.items.length, 1);
});
test("details tolerate string/array fields and missing episode info", () => {
  const c = normalizeXtreamCatalog(xtreamFixture.catalog, 0);
  const m = normalizeVodInfo(xtreamFixture.vodInfo, c.movie.items[0]);
  assert.equal(typeof m.backdrop, "string");
  assert.ok(Array.isArray(m.cast));
  const s = normalizeSeriesInfo(xtreamFixture.seriesInfo, c.series.items[0]);
  assert.deepEqual(s.seasons.map((x) => [x.number, x.episodes.length]), [[1, 2], [2, 1]]);
  assert.equal(s.seasons[0].episodes[1].plot, undefined);
});
test("player_api URL keeps credentials only in the query", () => {
  const u = new URL(xtreamUrl({ url: "https://tv.example.test:8080/", username: "u", password: "p" }, "get_series_info", { series_id: "9" }));
  assert.equal(u.pathname, "/player_api.php");
  assert.deepEqual([...u.searchParams], [["username", "u"], ["password", "p"], ["action", "get_series_info"], ["series_id", "9"]]);
});
test("garbage payloads produce empty sections, not exceptions", () => {
  const c = normalizeXtreamCatalog({ liveCategories: null, live: {}, vodCategories: "x", vod: [null, 1], seriesCategories: [], series: [{}] }, 0);
  assert.deepEqual([c.live.items.length, c.movie.items.length, c.series.items.length], [0, 0, 0]);
});
test("episodes as a list of season lists are flattened by season", () => {
  const c = normalizeXtreamCatalog(xtreamFixture.catalog, 0);
  const raw = { episodes: [[{ id: 1, episode_num: 1, title: "A" }], [{ id: 2, episode_num: 1, title: "B" }]] };
  const s = normalizeSeriesInfo(raw, c.series.items[0]);
  assert.deepEqual(s.seasons.map((x) => [x.number, x.episodes.length]), [[1, 1], [2, 1]]);
});
test("player_api URL ignores the path and query of a stored get.php URL", () => {
  const u = new URL(xtreamUrl({ url: "https://tv.example.test:8080/get.php?username=a&password=b&type=m3u_plus", username: "u", password: "p" }, "get_live_streams"));
  assert.equal(u.origin + u.pathname, "https://tv.example.test:8080/player_api.php");
  assert.deepEqual([...u.searchParams], [["username", "u"], ["password", "p"], ["action", "get_live_streams"]]);
});
test("items without a category go to the Outros folder", () => {
  const c = normalizeXtreamCatalog({
    liveCategories: [], live: [{ stream_id: 1, name: "Canal" }],
    vodCategories: [], vod: [{ stream_id: 2, name: "Filme", category_id: "" }],
    seriesCategories: [], series: [{ series_id: 3, name: "Série", category_id: null }],
  }, 0);
  for (const s of [c.live, c.movie, c.series]) {
    assert.equal(s.items[0].categoryId, "outros");
    assert.deepEqual(s.categories.map((x) => [x.id, x.name, x.count]), [["outros", "Outros", 1]]);
  }
});
