import assert from "node:assert/strict";
import test from "node:test";
import {
  availableNextEpisode,
  orderedEpisodes,
} from "../apps/web/src/features/cinema/models/episodes";

test("episodes cross seasons without mutating metadata or including specials", () => {
  const videos = [
    { id: "next", season: 2, episode: 1 },
    { id: "special", season: 0, episode: 1 },
    { id: "current", season: 1, episode: 2 },
    { id: "invalid", season: 1, episode: NaN },
  ];
  const ordered = orderedEpisodes(videos);
  assert.deepEqual(
    ordered.map((e) => e.id),
    ["current", "next"],
  );
  assert.equal(videos[0].id, "next");
  assert.equal(availableNextEpisode(ordered, 1, 2)?.id, "next");
  assert.equal(availableNextEpisode(ordered, 2, 1), undefined);
  assert.equal(availableNextEpisode(ordered, 99, 1), undefined);
});

test("a future episode is not skipped to autoplay a later entry", () => {
  const episodes = orderedEpisodes([
    { id: "a", season: 1, episode: 1 },
    { id: "b", season: 1, episode: 2, released: "2030-01-01" },
    { id: "c", season: 1, episode: 3 },
  ]);
  assert.equal(
    availableNextEpisode(episodes, 1, 1, Date.parse("2026-01-01")),
    undefined,
  );
  assert.equal(
    availableNextEpisode(episodes, 1, 1, Date.parse("2030-01-01"))?.id,
    "b",
  );
});
