import test from "node:test";
import assert from "node:assert/strict";
import { defaultPrefs, prefsFor, isCategoryHidden, adultItemsVisible, orderCategories, tvListPrefs } from "../src/modules/iptv/prefs.js";
import type { TVCategory } from "../src/modules/iptv/types.js";

const cat = (id: string, name: string, adult = false): TVCategory => ({ id, section: "live", name, adult, count: 1 });
const cats = [cat("1", "Portugal"), cat("2", "For Adults", true), cat("3", "Brasil"), cat("4", "Espanha")];

test("adult folders start hidden and can be shown", () => {
  const p = defaultPrefs();
  assert.equal(isCategoryHidden(cats[1], p), true);
  assert.equal(adultItemsVisible("live", p), false);
  p.shownAdult.live = ["2"];
  assert.equal(isCategoryHidden(cats[1], p), false);
  assert.equal(adultItemsVisible("live", p), true);
});
test("pinned first, then saved order, then provider order", () => {
  const p = { ...defaultPrefs(), pinned: { ...defaultPrefs().pinned, live: ["4"] }, order: { ...defaultPrefs().order, live: ["3", "1"] } };
  assert.deepEqual(orderCategories(cats, p).map((c) => [c.id, c.pinned, c.hidden]), [["4", true, false], ["3", false, false], ["1", false, false], ["2", false, true]]);
});
test("schema caps pins at 4 and rejects unknown keys", () => {
  const ok = defaultPrefs();
  ok.pinned.live = ["1", "2", "3", "4"];
  assert.ok(tvListPrefs.safeParse(ok).success);
  ok.pinned.live.push("5");
  assert.equal(tvListPrefs.safeParse(ok).success, false);
  assert.equal(tvListPrefs.safeParse({ ...defaultPrefs(), extra: 1 }).success, false);
});
test("prefsFor fills in missing parts", () => {
  assert.deepEqual(prefsFor({ tv: { l1: { favorites: { live: ["9"] } } } }, "l1").favorites.live, ["9"]);
  assert.deepEqual(prefsFor({}, "l1"), defaultPrefs());
});
test("prefsFor survives garbage and ignores unknown ids", () => {
  assert.deepEqual(prefsFor({ tv: { l1: "x" } }, "l1"), defaultPrefs());
  const p = { ...defaultPrefs(), pinned: { ...defaultPrefs().pinned, live: ["99", "4"] } };
  assert.deepEqual(orderCategories(cats, p).map((c) => c.id), ["4", "1", "2", "3"]);
});
