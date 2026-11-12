import { test } from "node:test";
import assert from "node:assert/strict";
import { srtToVtt } from "../src/modules/addons/subtitle-service.js";
import { streamEndpoint } from "../src/modules/addons/stream-service.js";

test("SRT subtitles become WebVTT the browser can load", () => {
  assert.equal(
    srtToVtt(
      "\ufeff1\r\n00:00:01,000 --> 00:00:02,500\r\nOlá\r\n\r\n2\n00:00:03,000 --> 00:00:04,000\nMundo\n",
    ),
    "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nOlá\n\n2\n00:00:03.000 --> 00:00:04.000\nMundo\n",
  );
  const vtt = "WEBVTT\n\n00:01.000 --> 00:02.000\nJá é VTT\n";
  assert.equal(srtToVtt(vtt), vtt);
});

test("subtitle add-ons are asked on the subtitles resource", () => {
  assert.equal(
    streamEndpoint(
      "https://subs.example.com/conf/manifest.json",
      {},
      "series",
      "tt0903747:1:2",
      [],
      "subtitles",
    ),
    "https://subs.example.com/conf/subtitles/series/tt0903747%3A1%3A2.json",
  );
});
