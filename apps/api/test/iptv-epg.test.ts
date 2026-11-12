import test from "node:test";
import assert from "node:assert/strict";
import { parseXmltv, nowNext, programmesBetween, fetchGuide, fetchShortEpg, setGuideFetch } from "../src/modules/iptv/epg.js";
import type { IPTVList } from "../src/modules/iptv/types.js";

const at = Date.parse;
const xml = `<tv>
<programme start="20261112210000 +0100" stop="20261112220000 +0100" channel="rtp1.pt"><title>Prós e Contras</title></programme>
<programme start="20261112200000 +0100" stop="20261112210000 +0100" channel="RTP1.pt"><title lang="pt">Telejornal &amp; Mais</title><title lang="en">News</title><desc>Caf&#233; &#x1f600;</desc></programme>
<programme start="20261112220000 +0100" channel="rtp1.pt"><title>Sem fim</title></programme>
<programme start="20261101000000" stop="20261101010000" channel="rtp1.pt"><title>Antigo</title></programme>
<programme start="20260230000000" stop="20260301010000" channel="rtp1.pt"><title>Data inválida</title></programme>
<programme start="20261112200000" stop="20261112190000" channel="rtp1.pt"><title>Invertido</title></programme></tv>`;
const list: IPTVList = { id: "guide", name: "Casa", type: "xtream", url: "https://tv.example.test/", username: "u", password: "segredo-123" };

test("XMLTV normalizes UTC dates, entities, ordering and overlapping window", () => {
  const idx = parseXmltv(xml, at("2026-11-12T19:30:00Z"), at("2026-11-12T21:00:00Z"));
  assert.deepEqual(idx.get("rtp1.pt"), [
    { start: at("2026-11-12T19:00:00Z"), stop: at("2026-11-12T20:00:00Z"), title: "Telejornal & Mais", description: "Café 😀" },
    { start: at("2026-11-12T20:00:00Z"), stop: at("2026-11-12T21:00:00Z"), title: "Prós e Contras" },
  ]);
  assert.equal(parseXmltv(xml, 0, Infinity).get("rtp1.pt")!.length, 3);
});
test("now/next and range use half-open programme boundaries and case-insensitive IDs", () => {
  const idx = parseXmltv(xml, at("2026-11-12T00:00:00Z"), Infinity);
  assert.deepEqual([nowNext(idx, "RTP1.PT", at("2026-11-12T19:30:00Z")).now?.title, nowNext(idx, "rtp1.pt", at("2026-11-12T19:30:00Z")).next?.title], ["Telejornal & Mais", "Prós e Contras"]);
  assert.equal(nowNext(idx, "rtp1.pt", at("2026-11-12T20:00:00Z")).now?.title, "Prós e Contras");
  assert.equal(programmesBetween(idx, "rtp1.pt", at("2026-11-12T20:00:00Z"), at("2026-11-12T21:00:00Z")).length, 1);
  assert.deepEqual(nowNext(idx, undefined, 0), {});
  assert.deepEqual(programmesBetween(idx, "missing", 0, Infinity), []);
});
test("XMLTV supports single quotes, CDATA and negative time zones", () => {
  const idx = parseXmltv(`<tv><programme start='20261112180000 -0100' stop='20261112200000' channel='a&amp;b'><title><![CDATA[A & B < C]]></title></programme></tv>`, 0, Infinity);
  assert.deepEqual(idx.get("a&b"), [{ start: at("2026-11-12T19:00:00Z"), stop: at("2026-11-12T20:00:00Z"), title: "A & B < C" }]);
});
test("guide fetch chooses explicit URL or Xtream XMLTV and hides network errors", async () => {
  const urls: string[] = [];
  setGuideFetch(async (url, options) => { urls.push(url); assert.equal(options?.maxBytes, 160 * 1024 * 1024); return new Response(xml); });
  assert.equal((await fetchGuide(list, at("2026-11-12T19:00:00Z"))).size, 1);
  const url = new URL(urls[0]); assert.equal(url.pathname, "/xmltv.php"); assert.equal(url.searchParams.get("password"), "segredo-123");
  await fetchGuide({ ...list, epgUrl: "https://guide.example.test/epg.xml" }, Date.now());
  assert.equal(urls[1], "https://guide.example.test/epg.xml");
  assert.equal((await fetchGuide({ ...list, type: "m3u" }, Date.now())).size, 0); assert.equal(urls.length, 2);
  setGuideFetch(async () => { throw new Error("https://tv.example.test/segredo-123"); });
  await assert.rejects(fetchGuide(list, Date.now()), (e: Error) => e.name === "ProviderError" && !/segredo|example/.test(e.message));
});
test("short EPG decodes base64 and ignores invalid timestamps", async () => {
  setGuideFetch(async (input) => {
    const url = new URL(input); assert.equal(url.searchParams.get("action"), "get_short_epg"); assert.equal(url.searchParams.get("stream_id"), "101");
    return Response.json({ epg_listings: [
      { title: "VGVsZWpvcm5hbA==", description: Buffer.from("Notícias").toString("base64"), start_timestamp: "1794510000", stop_timestamp: "1794513600" },
      { title: "WA==", start_timestamp: "broken", stop_timestamp: "1794513600" },
    ] });
  });
  assert.deepEqual(await fetchShortEpg(list, "101"), [{ start: 1794510000000, stop: 1794513600000, title: "Telejornal", description: "Notícias" }]);
  assert.deepEqual(await fetchShortEpg({ ...list, type: "m3u" }, "101"), []);
});
test("indexes a large guide within three seconds", () => {
  const entry = '<programme start="20261112200000 +0000" stop="20261112210000 +0000" channel="c"><title>Telejornal &amp; Notícias</title><desc>' + "x".repeat(80) + '</desc></programme>';
  const large = `<tv>${entry.repeat(200_000)}</tv>`;
  const start = performance.now(); const index = parseXmltv(large, 0, Infinity); const ms = performance.now() - start;
  assert.equal(index.get("c")!.length, 200_000); assert.ok(ms < 3000, `Indexing ${large.length} bytes took ${ms} ms`);
});
