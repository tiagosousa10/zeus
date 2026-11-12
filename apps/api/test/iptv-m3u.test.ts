import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeM3U } from "../src/modules/iptv/m3u.js";

const text = `#EXTM3U
#EXTINF:-1 tvg-id="rtp1.pt" tvg-logo="https://l.test/rtp.png" group-title="★ PORTUGAL ★",RTP1 HD
http://p.test/live/u/p/1.ts
#EXTINF:-1 group-title="Filmes Acção",Titãs (2026)
http://p.test/movie/u/p/9.mkv
#EXTINF:-1 group-title="Séries",Tróia S01 E04
http://p.test/series/u/p/77.mp4
#EXTINF:-1,Sem grupo
javascript:alert(1)`;

test("M3U becomes live, movie and series sections without exposing URLs as ids", () => {
  const c = normalizeM3U(text, "http://p.test/list.m3u", 5);
  assert.deepEqual(c.live.categories.map((x) => [x.name, x.country, x.count]), [["Portugal", "PT", 1]]);
  assert.equal(c.live.items[0].epgId, "rtp1.pt");
  assert.equal(c.live.items[0].source, "http://p.test/live/u/p/1.ts");
  assert.ok(!c.live.items[0].id.includes("p.test"));
  assert.deepEqual([c.movie.items[0].name, c.movie.items[0].year, c.movie.items[0].container], ["Titãs", 2026, "mkv"]);
  assert.equal(c.series.items.length, 1);
});

test("ids are stable across reloads", () => {
  assert.equal(
    normalizeM3U(text, "http://p.test/list.m3u", 1).live.items[0].id,
    normalizeM3U(text, "http://p.test/list.m3u", 2).live.items[0].id,
  );
});

test("titles with quotes and commas in the group are kept intact", () => {
  const c = normalizeM3U(`#EXTM3U\n#EXTINF:-1 group-title="A, B",Filme "Foo" Bar\nhttp://p.test/live/u/p/3.ts`, "http://p.test/l.m3u", 1);
  assert.equal(c.live.items[0].name, 'Filme "Foo" Bar');
  assert.equal(c.live.categories[0].name, "A, B");
});

test("group names classify movies and series when the URL does not", () => {
  const c = normalizeM3U(`#EXTM3U\n#EXTINF:-1 group-title="Filmes Acção",X\nhttp://p.test/abc/9.mp4\n#EXTINF:-1 group-title="Séries",Y S01E01\nhttp://p.test/abc/8.mp4`, "http://p.test/l.m3u", 1);
  assert.equal(c.movie.items.length, 1);
  assert.equal(c.series.items.length, 1);
  assert.equal(c.live.items.length, 0);
});

test("same URL in two groups gives two items, an exact repeat gives one", () => {
  const l = (g: string) => `#EXTINF:-1 group-title="${g}",A\nhttp://p.test/live/1.ts`;
  const two = normalizeM3U(`#EXTM3U\n${l("G1")}\n${l("G2")}`, "http://p.test/l.m3u", 1);
  assert.equal(two.live.items.length, 2);
  assert.notEqual(two.live.items[0].id, two.live.items[1].id);
  const same = normalizeM3U(`#EXTM3U\n${l("G1")}\n${l("G1")}`, "http://p.test/l.m3u", 1);
  assert.equal(same.live.items.length, 1);
  assert.equal(same.live.categories[0].count, 1);
});

test("M3U series keep their episodes for playback", () => {
  const c = normalizeM3U(`#EXTM3U
#EXTINF:-1 group-title="Séries",Tróia S01 E04
http://p.test/series/u/p/77.mp4
#EXTINF:-1 group-title="Séries",Tróia S01E02
http://p.test/series/u/p/75.mkv`, "http://p.test/l.m3u", 0);
  const s = c.series.items[0];
  assert.deepEqual(s.episodes!.map((e) => [e.season, e.number, e.container]), [[1, 4, "mp4"], [1, 2, "mkv"]]);
  assert.equal(s.episodes![0].source, "http://p.test/series/u/p/77.mp4");
});
test("episodes without SxxExx get season 1 and their position", () => {
  const c = normalizeM3U(`#EXTM3U
#EXTINF:-1 group-title="Séries",Tróia
http://p.test/series/u/p/1.mp4
#EXTINF:-1 group-title="Séries",Tróia
http://p.test/series/u/p/2.mp4`, "http://p.test/l.m3u", 0);
  assert.deepEqual(c.series.items[0].episodes!.map((e) => [e.season, e.number]), [[1, 1], [1, 2]]);
});
test("live URLs win over movie-like group names", () => {
  const c = normalizeM3U(`#EXTM3U
#EXTINF:-1 group-title="24/7 Movies",Cinema 24h
http://p.test/live/u/p/9.m3u8`, "http://p.test/l.m3u", 0);
  assert.equal(c.live.items.length, 1);
  assert.equal(c.movie.items.length, 0);
});
