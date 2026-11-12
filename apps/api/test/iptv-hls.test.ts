import test from "node:test";
import assert from "node:assert/strict";
import { rewritePlaylist } from "../src/modules/iptv/services/hls.js";

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
  const out = rewritePlaylist(
    master,
    "https://edge.test/live/x/index.m3u8",
    (u) => (seen.push(u), `/p/${seen.length}`),
  );
  assert.deepEqual(seen, [
    "https://edge.test/live/x/low/index.m3u8",
    "https://edge.test/live/x/audio/pt.m3u8",
    "https://keys.test/k?u=user&p=pass",
    "https://edge.test/live/x/init.mp4",
    "https://cdn.test/hls/user/pass/seg1.ts",
    "https://edge.test/live/x/seg2.ts",
  ]);
  assert.ok(!/edge\.test|cdn\.test|keys\.test|pass/.test(out));
  assert.match(out, /#EXTINF:6\.0,/);
});

test("CRLF becomes LF; blank lines and tags without URI stay as they are", () => {
  const out = rewritePlaylist(
    "#EXTM3U\r\n#EXT-X-VERSION:3\r\n\r\n#EXTINF:4,\r\n  a.ts  \r\n",
    "https://e.test/x/",
    () => "/r/0",
  );
  assert.equal(out, "#EXTM3U\n#EXT-X-VERSION:3\n\n#EXTINF:4,\n/r/0\n");
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
  const out = rewritePlaylist(
    text,
    "https://e.test/",
    (u) => (seen.push(u), `/r/${seen.length}`),
  );
  assert.deepEqual(seen, [
    "https://k.test/x/pass",
    "https://k.test/y/pass",
    "https://e.test/s.ts",
  ]);
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
  rewritePlaylist(
    text,
    "https://e.test/",
    (u, playlist) => (marks.push(`${u.slice(15)}:${playlist}`), "/r"),
  );
  assert.deepEqual(marks, [
    "v1:true",
    "a1:true",
    "i1:true",
    "r1:true",
    "k1:false",
    "m1:false",
    "s1:false",
  ]);
});

test("protocol- and root-relative values, steering, session data and asset lists are dropped", () => {
  const text = `#EXTM3U
#EXT-X-CONTENT-STEERING:SERVER-URI="steer.json"
#EXT-X-SESSION-DATA:DATA-ID="x",URI="data.json"
#EXT-X-DATERANGE:ID="ad",START-DATE="2026-11-12T00:00:00Z",X-ASSET-LIST="//cdn.test/u/pass/list.json"
#EXT-X-DATERANGE:ID="ad2",START-DATE="2026-11-12T00:00:00Z",X-ASSET-URI="asset.m3u8"
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="k",VALUE="/hls/u/pass/x"
#EXT-X-PROGRAM-DATE-TIME:2026-11-12T00:00:00Z
#EXTINF:6,//cdn.test/u/pass
s1.ts
#EXTINF:6,
http://[bad
#EXTINF:6,
s2.ts`;
  const seen: string[] = [];
  const out = rewritePlaylist(
    text,
    "https://e.test/",
    (u) => (seen.push(u), `/r/${seen.length}`),
  );
  assert.deepEqual(seen, ["https://e.test/s1.ts", "https://e.test/s2.ts"]);
  assert.ok(!/cdn\.test|pass|steer|data\.json|asset|\/\//.test(out), out);
  assert.equal(
    out,
    "#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:2026-11-12T00:00:00Z\n#EXTINF:6,\n/r/1\n#EXTINF:6,\n#EXTINF:6,\n/r/2",
  );
});

test("a dropped variant tag also drops its URI line", () => {
  const text = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1,X-HOME="//cdn.test/pass"
hidden.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2
shown.m3u8`;
  const marks: string[] = [];
  const out = rewritePlaylist(
    text,
    "https://e.test/",
    (u, playlist) => (marks.push(`${u}:${playlist}`), "/r/0"),
  );
  assert.deepEqual(marks, ["https://e.test/shown.m3u8:true"]);
  assert.equal(out, "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2\n/r/0");
});

test("lone CR, LS and PS split lines like hls.js, and backslash URLs never survive", () => {
  const cases: [string, string, boolean][] = [
    [
      "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\rhttps:\\\\cdn.test\\hls\\u\\pass\\1.ts\n",
      "https://cdn.test/hls/u/pass/1.ts",
      false,
    ],
    [
      "#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:2026-11-12T00:00:00Z\u2028https:\\\\cdn.test\\u\\pass\\1.ts\n",
      "https://cdn.test/u/pass/1.ts",
      false,
    ],
    [
      "#EXTM3U\n#EXTINF:6,\u2029/\\cdn.test/u/pass/1.ts\n",
      "https://cdn.test/u/pass/1.ts",
      false,
    ],
    [
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\rhttps:\\\\cdn.test\\u\\pass\\v.m3u8\n",
      "https://cdn.test/u/pass/v.m3u8",
      true,
    ],
  ];
  for (const [text, url, playlist] of cases) {
    const seen: string[] = [];
    const out = rewritePlaylist(
      text,
      "https://edge.test/hls/x/index.m3u8",
      (u, p) => (seen.push(`${u}:${p}`), "/r/0"),
    );
    assert.deepEqual(seen, [`${url}:${playlist}`], JSON.stringify(text));
    assert.ok(
      !/cdn\.test|pass|\\|[\r\u2028\u2029]/.test(out),
      JSON.stringify(out),
    );
  }
});

test("tags with backslash, scheme or root-relative values are dropped", () => {
  const text = [
    "#EXTM3U",
    "#EXT-X-PROGRAM-DATE-TIME:2026-11-12T00:00:00Z https:\\\\cdn.test\\u\\pass\\1.ts",
    '#EXT-X-KEY:METHOD=AES-128,URI="k",X-F="https:\\\\cdn.test\\u\\pass"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME=" /u/pass",URI="a.m3u8"',
    "#EXTGRP:/hls/u/pass",
    "#EXT-X-PROGRAM-DATE-TIME:/u/pass",
    '#EXT-X-DEFINE:NAME="h",VALUE="cdn.test"',
    "#EXTINF:6,u segredo-123",
    "s.ts",
  ].join("\n");
  const out = rewritePlaylist(text, "https://e.test/", () => "/r/0");
  assert.equal(out, "#EXTM3U\n#EXTINF:6,\n/r/0");
});

test("EXTINF keeps only its duration, so hls.js never reads the rest of the line as a segment URI", () => {
  const text = [
    "#EXTM3U",
    "#EXTINF:6 http:cdn.test/live/u/pass/1.ts",
    "a.ts",
    "#EXTINF:6\thttp:cdn.test/live/u/pass/2.ts,title",
    "b.ts",
    "#EXTINF: 6.5x https:cdn.test/u/pass/3.ts",
    "c.ts",
    "#EXTINF:http:cdn.test/u/pass/4.ts",
    "d.ts",
    "#extinf:.5,",
    "e.ts",
  ].join("\n");
  const seen: string[] = [];
  const out = rewritePlaylist(
    text,
    "https://e.test/",
    (u) => (seen.push(u.slice(15)), `/r/${seen.length}`),
  );
  assert.deepEqual(seen, ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]);
  assert.equal(
    out,
    "#EXTM3U\n#EXTINF:6,\n/r/1\n#EXTINF:6,\n/r/2\n#EXTINF:6.5,\n/r/3\n/r/4\n#EXTINF:.5,\n/r/5",
  );
});

test("tags with scheme-like text are dropped and ordinary tags are kept as they are", () => {
  const kept = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:6",
    "#EXT-X-MEDIA-SEQUENCE:123",
    "#EXT-X-PROGRAM-DATE-TIME:2026-11-12T20:00:00.000+00:00",
    '#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720',
    "/r/0",
    '#EXT-X-KEY:METHOD=AES-128,URI="/r/0",IV=0x0123456789abcdef0123456789abcdef',
    "#EXT-X-BYTERANGE:1000@0",
    "#EXTINF:6,",
    "/r/0",
    "#EXT-X-ENDLIST",
  ];
  const dropped = [
    "#EXT-X-PROGRAM-DATE-TIME:2026-11-12T20:00:00Z http:1.2.3.4/u/pass/1.ts",
    "#EXT-X-PROGRAM-DATE-TIME:http:cdn.test/u/pass/1.ts",
    "#EXT-X-ENDLIST http:cdn.test/u/pass/1.ts",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="http:cdn.test",URI="a.m3u8"',
    "#EXT-X-KEY:METHOD=AES-128,URI=k,X-F=http:cdn.test/u/pass",
    "#EXT-X-BYTERANGE:1000@0,https:cdn.test",
  ];
  const text = [...kept.slice(0, 9), ...dropped, ...kept.slice(9)].join("\n");
  const out = rewritePlaylist(text, "https://e.test/", () => "/r/0");
  assert.equal(out, kept.join("\n"));
});
