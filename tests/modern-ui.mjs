import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tvFixture, startTVServer } from "./tv-fixture.mjs";
const out = "/tmp/zeus-modern-ui";
await mkdir(out, { recursive: true });
const server = await startTVServer(5191);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await tvFixture(page, { largeSearch: true });
  await page.route("https://v3-cinemeta.strem.io/**", (r) =>
    r.fulfill({
      json: {
        metas: [
          {
            id: "tt4158110",
            type: "series",
            name: "Mr. Robot",
            releaseInfo: "2015",
            genres: ["Drama"],
            poster: "/art/img/zeus-4.webp",
          },
        ],
      },
    }),
  );
  // Hold a real foreground query long enough to activate both indicators.
  let releaseSummary;
  const summaryGate = new Promise((resolve) => {
    releaseSummary = resolve;
  });
  await page.route("**/api/iptv/lists/fixture", async (route) => {
    await summaryGate;
    return route.fallback();
  });
  await page.goto("http://127.0.0.1:5191/tv");
  await expect(
    page.locator('.zeus-loader[data-loading-scope="local"]'),
  ).toBeVisible();
  await page.locator(".zeus-activity").waitFor({ state: "attached" });
  await expect(page.locator(".zeus-activity")).toBeHidden();
  await expect(page.locator(".zeus-loader:visible")).toHaveCount(1);
  // A separate pending action still gets fallback feedback once the page loads.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("zeus:request", { detail: 1 })),
  );
  releaseSummary();
  await page.locator(".tv-portal").first().waitFor();
  await expect(page.locator(".zeus-activity")).toBeVisible();
  await expect(page.locator(".zeus-loader:visible")).toHaveCount(1);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("zeus:request", { detail: -1 })),
  );
  await expect(page.locator(".zeus-activity")).toBeHidden();
  await page.unroute("**/api/iptv/lists/fixture");
  await page.screenshot({ path: out + "/portals.png" });
  await page.keyboard.press("Meta+k");
  await page
    .getByRole("searchbox", { name: "Pesquisar em Cinema e TV" })
    .fill("canais Portugal");
  await page.waitForFunction(
    () => document.querySelectorAll(".search-module.tv").length === 60,
  );
  assert.equal(await page.locator(".search-module.tv").count(), 60);
  await page.screenshot({ path: out + "/search-tv.png" });
  await page.getByRole("searchbox").fill("Mr Robot");
  await page
    .locator(".universal-results a")
    .filter({ hasText: "Mr. Robot" })
    .first()
    .waitFor();
  await page.screenshot({ path: out + "/search-cinema.png" });
  assert.ok(
    (
      await page.locator(".universal-results a").first().getAttribute("href")
    ).startsWith("/titulo?"),
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.keyboard.press("Meta+k");
  await page.getByRole("searchbox").fill("Canal 49999");
  await page
    .locator(".universal-results a")
    .filter({ hasText: "Viagem" })
    .filter({ hasText: "Canal 49999" })
    .waitFor();
  await page
    .locator(".universal-results a")
    .filter({ hasText: "Viagem" })
    .filter({ hasText: "Canal 49999" })
    .click();
  await page.locator(".tv-player").waitFor();
  // Lock the document scroller too: body overflow alone leaves html scrolling.
  const documentScroll = await page.evaluate(() => ({
    x: scrollX,
    y: scrollY,
    hasScrollablePage: document.documentElement.scrollHeight > innerHeight,
  }));
  assert.ok(
    documentScroll.hasScrollablePage,
    "fixture must exercise a scrollable page behind the player",
  );
  await page.mouse.move(1400, 450);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(200);
  assert.deepEqual(
    await page.evaluate(() => ({ x: scrollX, y: scrollY })),
    { x: documentScroll.x, y: documentScroll.y },
    "wheel over playback must not scroll the page behind it",
  );
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).overflowY,
    ),
    "hidden",
  );
  // Playback is edge-to-edge, unlike ordinary padded dialogs. Check both
  // desktop and mobile rules, including resizing an already open player.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 1440, height: 810 },
  ]) {
    await page.setViewportSize(viewport);
    for (const selector of [
      ".tv-player-modal",
      ".tv-player",
      ".tv-player video",
    ]) {
      await expect
        .poll(() => page.locator(selector).boundingBox(), {
          message: `${selector} must fill the viewport after resize`,
        })
        .toEqual({ x: 0, y: 0, ...viewport });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: /^Menu da conta/ }).click();
  await page.getByRole("menuitem", { name: "Configuração da TV" }).click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Lista IPTV ativa", exact: true })
      .inputValue(),
    "other",
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.goto("http://127.0.0.1:5191/tv#section=series");
  await page.locator(".tv-bento").waitFor();
  await page.screenshot({ path: out + "/series.png" });
  await page.goto("http://127.0.0.1:5191/tv#section=series&detail=0");
  await page.locator(".tv-episode").first().waitFor();
  assert.ok(
    (await page.locator(".tv-episode").first().boundingBox()).width <= 280,
  );
  await page.screenshot({ path: out + "/episodes.png" });
  await page.goto("http://127.0.0.1:5191/explorar");
  await page.getByRole("searchbox").waitFor();
  await page.screenshot({ path: out + "/explore.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/explore-mobile.png" });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  // Failed start: initial request + exactly five automatic reconnects, then manual recovery.
  let starts = 0;
  await page.route("**/api/iptv/lists/*/play", (r) => {
    starts++;
    return r.fulfill({
      status: 502,
      json: { error: "Fornecedor indisponível." },
    });
  });
  await page.goto(
    "http://127.0.0.1:5191/tv#section=live&category=pt&play=0&name=Canal",
  );
  await page
    .locator(".tv-player")
    .waitFor({ timeout: 8000 })
    .catch(async (e) => {
      console.log(errors, await page.locator("body").innerText());
      throw e;
    });
  await page.clock.install();
  for (let i = 1; i <= 6; i++) {
    await page.waitForFunction(
      (n) =>
        document.querySelector(".tv-player-error") ||
        document
          .querySelector(".tv-player-loading")
          ?.textContent?.includes(`${n}/5`),
      i,
    );
    if (i < 6) await page.clock.fastForward(11000);
  }
  assert.equal(starts, 6);
  await page.clock.fastForward(120000);
  assert.equal(starts, 6);
  await page.screenshot({ path: out + "/player-exhausted.png" });
  await page
    .getByRole("button", { name: "Tentar de novo", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector(".tv-player-loading")?.textContent?.includes("1/5"),
  );
  assert.equal(starts, 7);
  const toggle = page.getByRole("button", { name: "Controlos do leitor" });
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.getByRole("button", { name: "Canais", exact: true }).click();
  await page.screenshot({ path: out + "/player-controls.png" });
  assert.ok(
    (await page.locator(".tv-player-bottom").boundingBox()).height < 220,
  );
  await toggle.click();
  await page.mouse.move(600, 400);
  await page.mouse.move(800, 500);
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.clock.fastForward(120000);
  assert.equal(starts, 7, "close cancels retry");
  // A start that never returns must leave the black screen after the watchdog expires.
  const pending = [];
  await page.route(
    "**/api/iptv/lists/*/play",
    (r) =>
      new Promise((resolve) => {
        pending.push(async () => {
          await r
            .fulfill({ status: 502, json: { error: "Timeout fixture" } })
            .catch(() => {});
          resolve();
        });
      }),
  );
  await page.locator(".tv-channel-main").first().click();
  await page.getByText("A ligar ao vídeo…", { exact: true }).waitFor();
  await page.clock.fastForward(20001);
  await page.getByText("A tentar novamente · 1/5", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await Promise.all(pending.map((release) => release()));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      screenshots: out,
      searchAcrossModules: true,
      retries: 5,
      startupWatchdog: true,
      crossListNavigation: true,
      manualRestart: true,
      cancelOnClose: true,
      pointerDoesNotRevealMenus: true,
      errors,
    }),
  );
} finally {
  await browser.close();
  server.kill();
}
