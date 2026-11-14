import test from "node:test";
import assert from "node:assert/strict";
import { parseXmltv } from "../../src/modules/iptv/services/epg.js";

test("indexes a large guide within three seconds", () => {
  const entry =
    '<programme start="20261112200000 +0000" stop="20261112210000 +0000" channel="c"><title>Telejornal &amp; Notícias</title><desc>' +
    "x".repeat(80) +
    "</desc></programme>";
  const large = `<tv>${entry.repeat(200_000)}</tv>`;
  const start = performance.now();
  const index = parseXmltv(large, 0, Infinity);
  const ms = performance.now() - start;
  assert.equal(index.get("c")!.length, 200_000);
  assert.ok(ms < 3000, `Indexing ${large.length} bytes took ${ms} ms`);
});
