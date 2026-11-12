import { defaultPrefs } from "../apps/api/src/modules/iptv/prefs";
import {
  preferenceChanges,
  togglePinned,
  toggleVisibility,
} from "../apps/web/src/pages/tv/helpers";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createSerialUpdater,
  normalizeSearch,
  searchVisible,
  encodeView,
  decodeView,
} from "../apps/web/src/pages/tv/helpers.ts";
test("queued preference mutations use last successful result and survive rejection", async () => {
  let value = { favorites: [] as string[], progress: 0 };
  const writes: (typeof value)[] = [];
  const update = createSerialUpdater(
    () => value,
    async (next) => {
      if (next.progress === -1) throw Error("offline");
      writes.push(next);
      value = next;
      return next;
    },
  );
  await Promise.all([
    update((p) => ({ ...p, favorites: [...p.favorites, "a"] })),
    update((p) => ({ ...p, progress: 12 })),
    update((p) => ({ ...p, favorites: [...p.favorites, "b"] })),
  ]);
  assert.deepEqual(value, { favorites: ["a", "b"], progress: 12 });
  await assert.rejects(update((p) => ({ ...p, progress: -1 })));
  await update((p) => ({ ...p, progress: 13 }));
  assert.equal(value.progress, 13);
  assert.equal(writes.length, 4);
});
test("search matches accents and excludes hidden categories in cached index", () => {
  assert.equal(normalizeSearch("  NOTÍCIAS  "), "noticias");
  const entries = [
    { k: "l" as const, id: "1", n: "Notícias", c: "Portugal" },
    { k: "l" as const, id: "2", n: "Notícias", c: "Adultos" },
  ];
  assert.deepEqual(
    searchVisible(entries, "noticias", new Set(["Portugal"])).map((x) => x.id),
    ["1"],
  );
  assert.equal(
    searchVisible(entries, "", new Set(["Portugal"]), {
      k: "l",
      name: "Adultos",
    }).length,
    0,
  );
});
test("navigation encodes arbitrary provider identifiers without collision", () => {
  const view = { section: "live" as const, categoryId: "PT / ? # & ç" };
  assert.deepEqual(decodeView(encodeView(view)), view);
  assert.deepEqual(decodeView("#invalid"), { section: "live" });
});

test("same-named search folders remain scoped to their section", () => {
  const rows = [
    { k: "l" as const, id: "l", n: "Zeus", c: "Portugal" },
    { k: "m" as const, id: "m", n: "Zeus", c: "Portugal" },
  ];
  assert.deepEqual(
    searchVisible(rows, "", new Set(["l:Portugal", "m:Portugal"]), {
      k: "l",
      name: "Portugal",
    }).map((x) => x.id),
    ["l"],
  );
});
test("preference invalidation excludes progress and ordinary favorites from search", () => {
  const p = defaultPrefs();
  assert.deepEqual(
    preferenceChanges(p, {
      ...p,
      progress: { a: { position: 2, duration: 10, updatedAt: 1 } },
    }),
    { visibility: false, folders: false, favorites: false },
  );
  assert.deepEqual(
    preferenceChanges(p, { ...p, favorites: { ...p.favorites, live: ["a"] } }),
    { visibility: false, folders: false, favorites: true },
  );
  assert.equal(
    preferenceChanges(p, { ...p, hidden: { ...p.hidden, live: ["c"] } })
      .visibility,
    true,
  );
});
test("serialized folder toggles use current state and enforce the four-pin limit", async () => {
  let p = defaultPrefs();
  const update = createSerialUpdater(
    () => p,
    async (next) => (p = next),
  );
  await Promise.all([
    update((p) => togglePinned(p, "live", "a")),
    update((p) => togglePinned(p, "live", "a")),
  ]);
  assert.deepEqual(p.pinned.live, []);
  for (const id of ["a", "b", "c", "d"])
    await update((p) => togglePinned(p, "live", id));
  await assert.rejects(update((p) => togglePinned(p, "live", "e")));
  assert.equal(p.pinned.live.length, 4);
  await Promise.all([
    update((p) => toggleVisibility(p, "live", "adult", true)),
    update((p) => toggleVisibility(p, "live", "adult", true)),
  ]);
  assert.ok(p.hidden.live.includes("adult"));
});
