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

test("lowercase, unquoted and unknown URL attributes and plain comments never leak", () => {
  const text = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,uri="https://k.test/x/pass"
#EXT-X-KEY:METHOD=AES-128,URI=https://k.test/y/pass
#EXT-X-DATERANGE:ID="ad",X-ASSET-LIST="https://a.test/z"
# comment https://c.test/pass
#EXTINF:6,
s.ts`;
  const seen: string[] = [];
  const out = rewritePlaylist(text, "https://e.test/", (u) => (seen.push(u), `/r/${seen.length}`));
  assert.deepEqual(seen, ["https://k.test/x/pass", "https://k.test/y/pass", "https://e.test/s.ts"]);
  assert.ok(!/k\.test|a\.test|c\.test|pass/.test(out), out);
  assert.match(out, /#EXT-X-KEY:METHOD=AES-128,URI="\/r\/2"/);
});

test("variant and rendition URIs are marked as playlists", () => {
  const text = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1
v1
#EXT-X-MEDIA:TYPE=AUDIO,URI="a1"
#EXT-X-I-FRAME-STREAM-INF:URI="i1"
#EXT-X-RENDITION-REPORT:URI="r1"
#EXT-X-KEY:METHOD=AES-128,URI="k1"
#EXT-X-MAP:URI="m1"
#EXTINF:6,
s1`;
  const marks: string[] = [];
  rewritePlaylist(text, "https://e.test/", (u, playlist) => (marks.push(`${u.slice(15)}:${playlist}`), "/r"));
  assert.deepEqual(marks, ["v1:true", "a1:true", "i1:true", "r1:true", "k1:false", "m1:false", "s1:false"]);
});
