import test from "node:test";
import assert from "node:assert/strict";
import { normalizeXtreamCatalog } from "../src/modules/iptv/services/xtream.js";
import { defaultPrefs } from "../src/modules/iptv/models/prefs.js";
import {
  sectionsView,
  categoryPage,
  searchIndex,
  visibleItem,
  publicItem,
  publicSeriesDetail,
} from "../src/modules/iptv/models/views.js";
import { normalizeM3U } from "../src/modules/iptv/services/m3u.js";
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
  assert.deepEqual(
    [page.total, page.items.length, page.items[0].name],
    [2, 1, "RTP1 HD"],
  );
});
test("a section without content is absent", () => {
  const empty = { ...c, series: { categories: [], items: [] } };
  assert.equal(sectionsView(empty, defaultPrefs()).sections.series, undefined);
});
test("public items never carry the M3U source", () => {
  assert.equal(
    "source" in publicItem({ id: "1", source: "http://p.test/u/p/1.ts" }),
    false,
  );
});
test("page items and visible items are stripped of source", () => {
  const withSource = {
    ...c,
    live: {
      ...c.live,
      items: c.live.items.map((i) => ({ ...i, source: "http://p.test/x" })),
    },
  };
  const page = categoryPage(withSource, defaultPrefs(), "live", "1", 0, 60)!;
  assert.ok(page.items.every((i) => !("source" in i)));
  assert.ok(visibleItem(withSource, defaultPrefs(), "live", page.items[0].id));
});
const gold = () => c.live.items.find((x) => x.name === "XXX Gold")!;
const goldVisible = (p: ReturnType<typeof defaultPrefs>) => [
  categoryPage(c, p, "live", "3", 0, 60)!.items.some(
    (i) => i.name === "XXX Gold",
  ),
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

test("series detail sent to the browser has no sources", () => {
  const d = publicSeriesDetail({
    id: "s",
    categoryId: "c",
    name: "T",
    adult: false,
    cast: [],
    episodes: [],
    seasons: [
      {
        number: 1,
        name: "Temporada 1",
        episodes: [
          {
            id: "e",
            season: 1,
            number: 1,
            title: "x",
            container: "mp4",
            source: "http://p.test/u/p/1.mp4",
          },
        ],
      },
    ],
  });
  assert.equal(JSON.stringify(d).includes("p.test"), false);
  assert.equal("episodes" in d, false);
});

test("M3U series pages carry no episodes or sources", () => {
  const m = normalizeM3U(
    `#EXTM3U
#EXTINF:-1 group-title="Séries",Tróia S01E01
http://p.test/series/u/p/1.mp4`,
    "http://p.test/l.m3u",
    0,
  );
  const page = categoryPage(
    m,
    defaultPrefs(),
    "series",
    m.series.categories[0].id,
    0,
    10,
  )!;
  assert.equal(page.items.length, 1);
  assert.equal(JSON.stringify(page).includes("p.test"), false);
  assert.equal("episodes" in page.items[0], false);
});

test("category filters apply before pagination across the whole folder", () => {
  const p = defaultPrefs();
  p.favorites.live = [c.live.items.find((i) => i.name === "SIC")!.id];
  assert.equal(
    categoryPage(c, p, "live", "1", 0, 1, { favorites: true })!.items[0].name,
    "SIC",
  );
  assert.equal(categoryPage(c, p, "live", "1", 0, 1, { q: "sic" })!.total, 1);
  assert.equal(
    categoryPage(c, p, "live", "1", 0, 1, { tag: "HD" })!.items[0].name,
    "RTP1 HD",
  );
});
test("anchor locates current channel page across the 48 channel dock boundary", () => {
  const many = {
    ...c,
    live: {
      ...c.live,
      items: Array.from({ length: 49 }, (_, i) => ({
        ...c.live.items[0],
        id: String(i),
        name: `Canal ${i}`,
      })),
    },
  };
  const last = categoryPage(many, defaultPrefs(), "live", "1", 0, 48, {
    anchor: "48",
  })!;
  assert.equal(last.page, 1);
  assert.deepEqual(
    last.items.map((i) => i.id),
    ["48"],
  );
  const previous = categoryPage(many, defaultPrefs(), "live", "1", 1, 48, {
    anchor: "47",
  })!;
  assert.equal(previous.page, 0);
  assert.equal(previous.items.at(-1)!.id, "47");
});
