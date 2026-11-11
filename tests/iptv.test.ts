import { test } from "node:test";
import assert from "node:assert/strict";
import { parseM3U } from "../apps/web/src/lib/iptv.ts";
test("M3U preserves names, groups, ids and relative URLs", () => {
  const c = parseM3U(
    '#EXTM3U\n#EXTINF:-1 tvg-id="rtp" tvg-logo="https://example.org/logo.png" group-title="Notícias",RTP, Portugal\n/live/1.m3u8\n',
    "https://example.org/list.m3u",
  );
  assert.equal(c.length, 1);
  assert.equal(c[0].name, "RTP, Portugal");
  assert.equal(c[0].group, "Notícias");
  assert.equal(c[0].url, "https://example.org/live/1.m3u8");
  assert.equal(c[0].epgId, "rtp");
});
test("M3U ignores executable URL schemes and incomplete entries", () => {
  assert.deepEqual(
    parseM3U(
      "#EXTM3U\n#EXTINF:-1,Unsafe\njavascript:alert(1)\n#EXTINF:-1,Missing",
      "https://example.org",
    ),
    [],
  );
});
