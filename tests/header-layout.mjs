import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startTVServer, tvFixture } from "./tv-fixture.mjs";
const out = "/tmp/zeus-header-layout";
await mkdir(out, { recursive: true });
const server = await startTVServer(5192);
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  await tvFixture(page);
  await page.route("https://v3-cinemeta.strem.io/**", (r) =>
    r.fulfill({
      json: {
        metas: [
          {
            id: "tt4158110",
            name: "Mr. Robot",
            type: "series",
            poster: "/art/img/zeus-4.webp",
          },
        ],
      },
    }),
  );
  for (const width of [1440, 1000, 900, 780, 760, 600, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const layouts = [];
    for (const module of ["cinema", "tv"]) {
      await page.goto(`http://127.0.0.1:5192/${module}`);
      await page.locator(".app-header-logo").waitFor();
      await page.locator(".app-header-sections > *").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() =>
        Object.fromEntries(
          [
            ".app-header",
            ".app-header-logo",
            ".app-header-modules",
            ".app-header-sections",
            ".app-header-search",
          ].map((selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return [selector, { x: r.x, y: r.y, w: r.width, h: r.height }];
          }),
        ),
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
        `${module} overflow at ${width}`,
      );
      assert.ok(
        layout[".app-header-logo"].x + layout[".app-header-logo"].w <=
          layout[".app-header-modules"].x,
        `logo overlaps modules at ${width}`,
      );
      assert.ok(
        layout[".app-header-modules"].x + layout[".app-header-modules"].w <=
          layout[".app-header-search"].x,
        `modules overlap search at ${width}`,
      );
      if (width > 780)
        assert.ok(
          layout[".app-header-sections"].x + layout[".app-header-sections"].w <=
            layout[".app-header-search"].x,
          `sections overlap tools at ${width}`,
        );
      if (width === 1440) {
        const account = page.getByRole("button", { name: /Menu da conta/ });
        await account.click();
        await page.getByRole("menu", { name: "Conta", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        assert.ok(
          await account.evaluate((el) => el === document.activeElement),
        );
        await page
          .getByRole("button", { name: "Pesquisar", exact: true })
          .click();
        await page
          .getByRole("dialog", { name: "Pesquisar em Cinema e TV" })
          .waitFor();
        await page.keyboard.press("Escape");
      }
      layouts.push(layout);
      if ([1440, 900, 375].includes(width))
        await page.screenshot({ path: `${out}/${module}-${width}.png` });
    }
    for (const selector of [
      ".app-header",
      ".app-header-logo",
      ".app-header-modules",
      ".app-header-sections",
      ".app-header-search",
    ]) {
      // Sections have different labels/widths. Their origin and height must match.
      const keys =
        selector === ".app-header-sections"
          ? ["x", "y", "h"]
          : ["x", "y", "w", "h"];
      for (const key of keys)
        assert.ok(
          Math.abs(layouts[0][selector][key] - layouts[1][selector][key]) < 0.2,
          `${width} ${selector} ${key}: ${JSON.stringify(layouts)}`,
        );
    }
  }
  console.log(
    "PASS identical Cinema/TV header geometry at 8 widths; no overflow. " + out,
  );
} finally {
  await browser?.close();
  server.kill();
}
