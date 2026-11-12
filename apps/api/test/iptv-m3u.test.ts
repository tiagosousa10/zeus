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
