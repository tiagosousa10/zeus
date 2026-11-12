import { test } from "node:test";
import assert from "node:assert/strict";
import { addonSources } from "../src/modules/addons/streams.js";

const addon = { id: "test.addon", name: "Teste" };

test("external and YouTube sources are kept only as links to open outside Zeus", () => {
  const sources = addonSources(
    [
      { name: "Site", externalUrl: "https://example.com/watch/1" },
      { name: "Trailer", ytId: "dQw4w9WgXcQ" },
      { name: "Script", externalUrl: "javascript:alert(1)" },
      { name: "Bad yt", ytId: "../../x" },
      { name: "Torrent", infoHash: "a".repeat(40) },
    ],
    addon,
  );
  assert.deepEqual(
    sources.map((s) => [s.name, s.externalUrl, s.url, s.infoHash]),
    [
      ["Site", "https://example.com/watch/1", undefined, undefined],
      [
        "Trailer",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        undefined,
        undefined,
      ],
      ["Torrent", undefined, undefined, "a".repeat(40)],
    ],
  );
});

test("a playable source never carries an external link", () => {
  const [source] = addonSources(
    [{ url: "https://cdn.example.com/v.mp4", externalUrl: "https://x.test" }],
    addon,
  );
  assert.equal(source.url, "https://cdn.example.com/v.mp4");
  assert.equal(source.externalUrl, undefined);
});
