import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recentItems,
  continueItems,
  orderedEpisodes,
  resumePosition,
} from "../apps/web/src/pages/tv/catalog-helpers";
test("editorial ordering is deterministic and does not mutate pages", () => {
  const items = [
    { id: "b", name: "Beta", added: 4 },
    { id: "c", name: "Alfa", added: 4 },
    { id: "a", name: "Velho", added: 1 },
  ];
  assert.deepEqual(
    recentItems(items).map((x) => x.id),
    ["c", "b", "a"],
  );
  assert.equal(items[0].id, "b");
});
test("continue is gated by visible compact index and excludes completed or malformed progress", () => {
  const index = [
    { k: "s" as const, id: "s1", n: "Série", c: "Drama" },
    { k: "m" as const, id: "m1", n: "Filme", c: "Cinema" },
  ];
  const p = {
    "series:s1:e1": { position: 30, duration: 100, updatedAt: 2 },
    "movie:m1": { position: 95, duration: 100, updatedAt: 3 },
    "movie:hidden": { position: 4, duration: 10, updatedAt: 4 },
    "movie:bad": { position: 1, duration: 0, updatedAt: 5 },
  };
  assert.deepEqual(
    continueItems(index, p, "series").map((x) => x.key),
    ["series:s1:e1"],
  );
  assert.equal(continueItems(index, p, "movie").length, 0);
});
test("episodes follow real season and episode numbers", () => {
  assert.deepEqual(
    orderedEpisodes([
      { id: "b", season: 2, number: 1 },
      { id: "a", season: 1, number: 2 },
      { id: "c", season: 1, number: 1 },
    ]).map((x) => x.id),
    ["c", "a", "b"],
  );
});

test("completed episode entry points restart at zero", () => {
  assert.equal(
    resumePosition({ position: 95, duration: 100, updatedAt: 1 }),
    0,
  );
  assert.equal(
    resumePosition({ position: 100, duration: 100, updatedAt: 1 }),
    0,
  );
  assert.equal(
    resumePosition({ position: 42, duration: 100, updatedAt: 1 }),
    42,
  );
});
