import test from "node:test";
import assert from "node:assert/strict";
import { rewritePlaylist } from "../src/modules/iptv/hls.js";

const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000
low/index.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio/pt.m3u8"
#EXT-X-KEY:METHOD=AES-128,URI="https://keys.test/k?u=user&p=pass"
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
https://cdn.test/hls/user/pass/seg1.ts
seg2.ts`;

test("every URI is rewritten and nothing upstream is left", () => {
  const seen: string[] = [];
  const out = rewritePlaylist(master, "https://edge.test/live/x/index.m3u8", (u) => (seen.push(u), `/p/${seen.length}`));
  assert.deepEqual(seen, [
    "https://edge.test/live/x/low/index.m3u8", "https://edge.test/live/x/audio/pt.m3u8", "https://keys.test/k?u=user&p=pass",
    "https://edge.test/live/x/init.mp4", "https://cdn.test/hls/user/pass/seg1.ts", "https://edge.test/live/x/seg2.ts",
  ]);
  assert.ok(!/edge\.test|cdn\.test|keys\.test|pass/.test(out));
  assert.match(out, /#EXTINF:6\.0,/);
});

test("CRLF line endings, blank lines and tags without URI stay as they are", () => {
  const out = rewritePlaylist("#EXTM3U\r\n#EXT-X-VERSION:3\r\n\r\n#EXTINF:4,\r\n  a.ts  \r\n", "https://e.test/x/", () => "/r/0");
  assert.equal(out, "#EXTM3U\r\n#EXT-X-VERSION:3\r\n\r\n#EXTINF:4,\r\n/r/0\r\n");
});
