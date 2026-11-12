import test from "node:test";
import assert from "node:assert/strict";
import {
  localDayKey,
  localDayBounds,
  shiftLocalDay,
  guideWindows,
  mergeGuideWindows,
  type GuideGrid,
} from "../apps/web/src/pages/tv/guide-helpers";
import {
  overlappingGuideDays,
  validGuideZone,
} from "../apps/api/src/modules/iptv/guide-days";
test("Lisbon civil days include summer midnight and DST days of 23/25 hours", () => {
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Lisbon";
  try {
    assert.equal(localDayKey(Date.parse("2026-07-01T23:30:00Z")), "2026-07-02");
    const summer = localDayBounds("2026-07-02");
    assert.equal(
      new Date(summer.from).toISOString(),
      "2026-07-01T23:00:00.000Z",
    );
    assert.equal(new Date(summer.to).toISOString(), "2026-07-02T23:00:00.000Z");
    for (const [day, hours] of [
      ["2026-03-29", 23],
      ["2026-10-25", 25],
    ] as const) {
      const { from, to } = localDayBounds(day),
        windows = guideWindows(from, to);
      assert.equal(to - from, hours * 3600000);
      assert.ok(windows.every((w) => w.to - w.from <= 86400000));
      assert.equal(windows[0].from, from);
      assert.equal(windows.at(-1)!.to, to);
      assert.equal(windows.length, hours === 25 ? 2 : 1);
      assert.equal(localDayKey(to), shiftLocalDay(day, 1));
    }
    assert.equal(shiftLocalDay("2026-03-30", -1), "2026-03-29");
    assert.equal(shiftLocalDay("2026-10-26", -1), "2026-10-25");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("availability includes overlapping local days and excludes exclusive midnight stop", () => {
  const from = Date.parse("2026-06-30T00:00Z"),
    to = Date.parse("2026-07-04T00:00Z");
  assert.deepEqual(
    overlappingGuideDays(
      [
        {
          start: Date.parse("2026-07-01T22:30Z"),
          stop: Date.parse("2026-07-01T23:30Z"),
        },
      ],
      "Europe/Lisbon",
      from,
      to,
    ),
    ["2026-07-01", "2026-07-02"],
  );
  assert.deepEqual(
    overlappingGuideDays(
      [
        {
          start: Date.parse("2026-07-01T22:30Z"),
          stop: Date.parse("2026-07-01T23:00Z"),
        },
      ],
      "Europe/Lisbon",
      from,
      to,
    ),
    ["2026-07-01"],
  );
  assert.deepEqual(
    overlappingGuideDays(
      [{ start: 0, stop: 1e15 }],
      "Europe/Lisbon",
      from,
      from + 86400000,
    ),
    ["2026-06-30", "2026-07-01"],
  );
  assert.equal(validGuideZone("invalid/zone"), false);
});
test("25 hour split combines the same bounded rows and deduplicates shared programme", () => {
  const programme = { title: "Atravessa janela", start: 100, stop: 200 };
  const make = (programmes: (typeof programme)[]): GuideGrid => ({
    total: 80,
    page: 1,
    size: 40,
    channels: [{ id: "c", name: "Canal", categoryId: "pt", programmes }],
  });
  const result = mergeGuideWindows([
    make([programme]),
    make([programme, { title: "Seguinte", start: 200, stop: 300 }]),
  ]);
  assert.equal(result.channels.length, 1);
  assert.equal(result.channels[0].programmes.length, 2);
  assert.equal(result.page, 1);
  assert.equal(result.total, 80);
});
