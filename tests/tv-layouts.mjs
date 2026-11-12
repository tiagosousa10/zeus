import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tvFixture, settleTV, startTVServer } from "./tv-fixture.mjs";
const directory = "/tmp/zeus-tv-layouts";
await mkdir(directory, { recursive: true });
const server = await startTVServer(5193);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const categories = [
  ["pt", "Portugal", "PT", 49],
  ["br", "Brasil", "BR", 595],
  ["es", "Espanha", "ES", 345],
  ["fr", "França", "FR", 759],
  ["de", "Alemanha", "DE", 1205],
  ["it", "Itália", "IT", 152],
].map(([id, name, country, count], index) => ({
  id,
  name,
  country,
  count,
  pinned: index === 0,
  hidden: false,
}));
const errors = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 960 },
      reducedMotion: "reduce",
    });
    page.on("pageerror", (error) => errors.push(error.message));
    const fixture = await tvFixture(page);
    await page.route("**/api/iptv/lists/fixture", (route) =>
      route.fulfill({
        json: {
          fetchedAt: Date.now(),
          sections: { live: { categories, total: 3105, hiddenCount: 0 } },
        },
      }),
    );
    await page.goto("http://127.0.0.1:5193/tv");
    await page.locator(".tv-portal").first().waitFor();
    const switcher = page.getByRole("group", {
      name: "Vista dos portais e canais",
    });
    const choose = async (name) => {
      await switcher.getByRole("button", { name, exact: true }).click();
      await expect(
        switcher.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    };
    const capture = async (name) => {
      await settleTV(page);
      await page.locator(".tv-live-heading").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${directory}/${name}-${width}.png` });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
        `${name} has no horizontal overflow`,
      );
    };
    await choose("Lista");
    await expect(page.locator(".tv-portals--list .tv-portal")).toHaveCount(6);
    await capture("portals-list");
    await page.locator(".tv-portal").filter({ hasText: "Portugal" }).click();
    await page.locator(".tv-channel--row").first().waitFor();
    await capture("channels-list");
    assert.ok(
      (await page.locator(".tv-channel-main").first().boundingBox()).height <=
        110,
      "list rows remain compact on mobile and desktop",
    );
    await page.locator(".tv-channel-main").first().focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page
        .locator(".tv-channel-main")
        .nth(1)
        .evaluate((element) => element === document.activeElement),
      true,
      "down moves by one row in list view",
    );
    await page
      .getByRole("button", {
        name: "Adicionar Canal 0 aos favoritos",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Remover Canal 0 dos favoritos",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "★ Favoritos", exact: true })
      .click();
    await expect(page.locator(".tv-channel")).toHaveCount(1);
    await choose("Workspace");
    await expect(page.locator(".tv-channel")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "★ Favoritos", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(page.locator(".tv-channel")).toHaveCount(48);
    await capture("workspace-channels");
    await page.getByRole("button", { name: "Seguinte →", exact: true }).click();
    await expect(page.locator(".tv-channel")).toHaveCount(1);
    await choose("Cartões");
    await expect(
      page.getByText("Página 2 de 2", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".tv-channel--row")).toHaveCount(0);
    await choose("Workspace");
    await expect(
      page.getByText("Página 2 de 2", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Filtrar portais").fill("franca");
    const portals = page.getByRole("navigation", {
      name: "Portais do workspace",
    });
    await expect(portals.getByRole("button")).toHaveCount(1);
    await portals.getByRole("button", { name: /França/ }).click();
    await expect(page.locator(".tv-workspace-category h2")).toHaveText(
      "França",
    );
    await expect(
      page.getByText("Página 1 de 2", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Filtrar portais").fill("zzzzzz");
    await expect(page.getByRole("status")).toHaveText(
      "Nenhum portal encontrado.",
    );
    await page.getByLabel("Filtrar portais").fill("");
    await page.reload();
    await expect(
      switcher.getByRole("button", { name: "Workspace", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".tv-workspace-category h2")).toHaveText(
      "França",
    );
    await page.goto("http://127.0.0.1:5193/tv");
    await page.locator(".tv-workspace-welcome").waitFor();
    await capture("workspace-portals");
    assert.equal(
      fixture.starts.length,
      0,
      "changing layouts never starts a stream",
    );
    await page
      .getByRole("button", { name: "Explorar Portugal", exact: false })
      .click();
    await page.locator(".tv-channel-main").first().click();
    await page.locator(".tv-player").waitFor();
    assert.equal(fixture.starts.at(-1).section, "live");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.locator(".tv-workspace")).toBeVisible();
    await page.evaluate(() =>
      localStorage.setItem("zeus-tv-live-layout", "invalid-layout"),
    );
    await page.reload();
    await expect(
      switcher.getByRole("button", { name: "Cartões", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      responsiveViews: [1440, 390],
      persistedLayout: true,
      keyboardRows: true,
      filtersAndPagePreserved: true,
      workspaceNavigationAndPlayback: true,
      screenshots: directory,
      errors,
    }),
  );
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
