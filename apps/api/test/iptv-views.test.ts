import test from "node:test";
import assert from "node:assert/strict";
import { normalizeXtreamCatalog } from "../src/modules/iptv/xtream.js";
import { defaultPrefs } from "../src/modules/iptv/prefs.js";
import { sectionsView, categoryPage, searchIndex, visibleItem, publicItem } from "../src/modules/iptv/views.js";
import { xtreamFixture } from "./fixtures/xtream.js";

const c = normalizeXtreamCatalog(xtreamFixture.catalog, 0);

test("sections count only what is visible and say how much is hidden", () => {
  const v = sectionsView(c, defaultPrefs());
  assert.deepEqual(Object.keys(v.sections), ["live", "movie", "series"]);
  assert.equal(v.sections.live!.total, 2);
  assert.equal(v.sections.live!.hiddenCount, 1);
});
test("adult items in normal folders stay out of pages, search and details", () => {
  const p = defaultPrefs();
  assert.equal(categoryPage(c, p, "live", "3", 0, 60)!.total, 0);
  assert.equal(categoryPage(c, p, "live", "2", 0, 60), undefined);
  assert.ok(!searchIndex(c, p).some((e) => /XXX|Canal 18/.test(e.n)));
  const gold = c.live.items.find((x) => x.name === "XXX Gold")!;
  assert.equal(visibleItem(c, p, "live", gold.id), undefined);
});
test("pages are sliced and keep provider order", () => {
  const page = categoryPage(c, defaultPrefs(), "live", "1", 0, 1)!;
  assert.deepEqual([page.total, page.items.length, page.items[0].name], [2, 1, "RTP1 HD"]);
});
test("a section without content is absent", () => {
  const empty = { ...c, series: { categories: [], items: [] } };
  assert.equal(sectionsView(empty, defaultPrefs()).sections.series, undefined);
});
test("public items never carry the M3U source", () => {
  assert.equal("source" in publicItem({ id: "1", source: "http://p.test/u/p/1.ts" }), false);
});
test("page items and visible items are stripped of source", () => {
  const withSource = { ...c, live: { ...c.live, items: c.live.items.map((i) => ({ ...i, source: "http://p.test/x" })) } };
  const page = categoryPage(withSource, defaultPrefs(), "live", "1", 0, 60)!;
  assert.ok(page.items.every((i) => !("source" in i)));
  assert.ok(visibleItem(withSource, defaultPrefs(), "live", page.items[0].id));
});
const gold = () => c.live.items.find((x) => x.name === "XXX Gold")!;
const goldVisible = (p: ReturnType<typeof defaultPrefs>) => [
  categoryPage(c, p, "live", "3", 0, 60)!.items.some((i) => i.name === "XXX Gold"),
  searchIndex(c, p).some((e) => e.n === "XXX Gold"),
  visibleItem(c, p, "live", gold().id) !== undefined,
];
test("adult items show only while an adult folder is shown", () => {
  const p = defaultPrefs();
  p.shownAdult.live = ["2"];
  assert.deepEqual(goldVisible(p), [true, true, true]);
});
test("a stale shownAdult id does not reveal adult items", () => {
  const p = defaultPrefs();
  p.shownAdult.live = ["999"];
  assert.deepEqual(goldVisible(p), [false, false, false]);
});
test("an adult folder shown and then hidden keeps adult items hidden", () => {
  const p = defaultPrefs();
  p.shownAdult.live = ["2"];
  p.hidden.live = ["2"];
  assert.deepEqual(goldVisible(p), [false, false, false]);
});
test("a hidden normal folder leaves pages, search and totals", () => {
  const p = defaultPrefs();
  p.hidden.live = ["1"];
  assert.equal(categoryPage(c, p, "live", "1", 0, 60), undefined);
  assert.ok(!searchIndex(c, p).some((e) => e.n === "RTP1 HD" || e.n === "SIC"));
  const live = sectionsView(c, p).sections.live!;
  assert.equal(live.total, 0);
  const folder = live.categories.find((x) => x.id === "1")!;
  assert.deepEqual([folder.hidden, folder.count], [true, 0]);
});
