import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mockMember } from "./visual-fixtures.mjs";
import { tvFixture, tvState } from "./tv-fixture.mjs";
const referenceRoot = resolve("prototipos/estilo");
const reference = createServer(async (req, res) => {
  try {
    const file = resolve(
      referenceRoot,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (!file.startsWith(referenceRoot + sep)) throw new Error("path");
    const bytes = await readFile(file);
    res.writeHead(200, {
      "content-type":
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".webp": "image/webp",
          ".svg": "image/svg+xml",
        }[extname(file)] || "application/octet-stream",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => reference.listen(5182, "127.0.0.1", r));
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts"],
  { env: { ...process.env, WEB_PORT: "5181" }, stdio: "ignore" },
);
let browser;
const directory = "/tmp/zeus-fidelity";
await mkdir(directory, { recursive: true });
const report = [];
async function geometry(page, selectors) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error("Missing " + selector);
          const box = el.getBoundingClientRect(),
            css = getComputedStyle(el);
          return [
            selector,
            {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              font: css.font,
              borderRadius: css.borderRadius,
            },
          ];
        }),
      ),
    selectors,
  );
}
function equalGeometry(expected, actual, label) {
  for (const [selector, metrics] of Object.entries(expected)) {
    for (const [key, value] of Object.entries(metrics)) {
      const got = actual[selector][key];
      if (typeof value === "number")
        assert(
          Math.abs(value - got) < 1,
          `${label} ${selector}.${key}: expected ${value}, got ${got}`,
        );
      else assert.equal(got, value, `${label} ${selector}.${key}`);
    }
  }
}
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5181")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const app = await context.newPage(),
    ref = await context.newPage();
  const mocked = await mockMember(app, tvState);
  await tvFixture(app);
  const errors = [];
  app.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 375]) {
    await Promise.all([
      app.setViewportSize({ width, height: 900 }),
      ref.setViewportSize({ width, height: 900 }),
    ]);
    await Promise.all([
      ref.goto("http://127.0.0.1:5182/zeus/tv.html"),
      app.goto("http://127.0.0.1:5181/tv"),
    ]);
    await ref.locator("#i-title").filter({ hasText: /\S/ }).waitFor();
    await app.locator(".info__ch").waitFor();
    await app.locator(".hermes.is-on").waitFor();
    await ref.locator(".hermes.is-on").waitFor();
    const selectors = [
      ".z-nav",
      ".z-nav .z-wordmark",
      ".z-nav>.z-seg",
      ".z-nav__end",
      ".tv-tabs",
      ".tv",
      ".hermes",
      ".aura",
      ".info__ch",
    ];
    const expected = await geometry(ref, selectors),
      actual = await geometry(app, selectors);
    equalGeometry(expected, actual, `TV ${width}`);
    await Promise.all([
      ref.screenshot({ path: `${directory}/tv-reference-${width}.png` }),
      app.screenshot({ path: `${directory}/tv-implemented-${width}.png` }),
    ]);
    assert.equal(
      await app.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    report.push({ page: "tv", width, expected, actual });
    await app
      .getByRole("searchbox", { name: "Pesquisar canais", exact: true })
      .fill("inexistente-visual");
    await app.getByText("Nenhum canal encontrado. Tenta outro nome.").waitFor();
    assert(
      await app
        .getByRole("searchbox", { name: "Pesquisar canais", exact: true })
        .isVisible(),
    );
    await app
      .getByRole("searchbox", { name: "Pesquisar canais", exact: true })
      .fill("");
    await app.getByRole("button", { name: "Pesquisar", exact: true }).click();
    await app.locator("#z-nav-search input").fill("Cinema");
    await app.keyboard.press("Escape");
    assert.equal(await app.locator("#z-nav-search").isVisible(), false);
    await app
      .getByRole("button", { name: "Menu da conta, Inês Duarte" })
      .click();
    assert.equal(
      await app.evaluate(() => document.activeElement.textContent),
      "Conta",
    );
    await app.keyboard.press("End");
    assert.equal(
      await app.evaluate(() => document.activeElement.textContent),
      "Sair",
    );
    await app.keyboard.press("Escape");
    await app.getByRole("tab", { name: "Guia", exact: true }).click();
    await app.locator(".epg__b").first().click();
    const cellBefore = await app.evaluate(
      () => document.activeElement.dataset.start,
    );
    await app.keyboard.press("ArrowRight");
    assert.notEqual(
      await app.evaluate(() => document.activeElement.dataset.start),
      cellBefore,
    );
    assert.equal(await app.locator('.epg__b[tabindex="0"]').count(), 1);
    const channelBefore = await app.evaluate(
      () => document.activeElement.dataset.channel,
    );
    await app.keyboard.press("ArrowDown");
    assert.notEqual(
      await app.evaluate(() => document.activeElement.dataset.channel),
      channelBefore,
    );
    assert(
      await app
        .getByRole("button", { name: "Ver canal em directo" })
        .isVisible(),
    );
    for (const [tab, id] of [
      ["Guia", "guia"],
      ["Favoritos", "favoritos"],
      ["Listas IPTV", "listas"],
    ]) {
      await app.getByRole("tab", { name: tab, exact: true }).click();
      await app.screenshot({ path: `${directory}/tv-${id}-${width}.png` });
    }
    await app
      .getByRole("button", { name: "Adicionar lista", exact: true })
      .click();
    await app.getByLabel("M3U", { exact: true }).check();
    await app.getByLabel("Nome", { exact: true }).fill("Viagem");
    await app
      .getByLabel("URL da lista M3U", { exact: true })
      .fill("https://media.example.test/viagem.m3u");
    await app.screenshot({ path: `${directory}/tv-modal-${width}.png` });
    await app
      .getByRole("dialog")
      .getByRole("button", { name: "Adicionar lista", exact: true })
      .click();
    await app.getByRole("dialog").waitFor({ state: "detached" });
    assert(mocked.getState().iptv.some((l) => l.name === "Viagem"));
    await app.getByRole("tab", { name: "Favoritos", exact: true }).click();
    const before = [...mocked.getState().preferences.favoriteChannels];
    await app.getByRole("button", { name: /Mover Cinema Mais/ }).focus();
    await app.keyboard.press("ArrowDown");
    await app.waitForTimeout(50);
    assert.notDeepEqual(mocked.getState().preferences.favoriteChannels, before);
    if (width === 375) {
      const initial = [...mocked.getState().preferences.favoriteChannels];
      const box = await app.locator(".sort .handle").first().boundingBox();
      const cdp = await context.newCDPSession(app);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + 15, y: box.y + 20 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: box.x + 15, y: box.y + 100 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await cdp.detach();
      await app.waitForTimeout(80);
      assert.notDeepEqual(
        mocked.getState().preferences.favoriteChannels,
        initial,
        "touch reorder saves order",
      );
    }
    await app
      .getByRole("switch", { name: "Mostrar Filmes", exact: true })
      .click();
    await app.waitForTimeout(50);
    assert(
      mocked.getState().preferences.hiddenChannelGroups.includes("Filmes"),
    );
    await app.getByRole("tab", { name: "Em directo", exact: true }).click();
    assert.equal(
      await app
        .getByRole("button", { name: "Ver Cinema Mais", exact: true })
        .count(),
      0,
      "hidden channels excluded from favourites/recent rows",
    );
    await app.getByRole("tab", { name: "Favoritos", exact: true }).click();
    await app
      .getByRole("switch", { name: "Mostrar Filmes", exact: true })
      .click();
    await Promise.all([
      ref.goto("http://127.0.0.1:5182/zeus/estados.html"),
      app.goto("http://127.0.0.1:5181/estados"),
    ]);
    await Promise.all([
      app.locator(".visual").waitFor(),
      ref.locator(".visual").waitFor(),
    ]);
    // The prototype's synthetic boot log changes intrinsic grid width as it runs. Use the same status text in both renderings.
    await ref.locator("#log").evaluate(
      (el, text) => {
        el.textContent = text;
      },
      await app.locator(".log").innerText(),
    );
    const referenceClock = await geometry(ref, [".visual", ".clock"]),
      appClock = await geometry(app, [".visual", ".clock"]);
    equalGeometry(referenceClock, appClock, `Estados ${width}`);
    report.push({
      page: "states",
      width,
      expected: referenceClock,
      actual: appClock,
    });
    for (const tab of ["Motor", "Sessão", "Continuar a ver", "Ligação"]) {
      await app.getByRole("tab", { name: tab, exact: true }).click();
      assert.equal(await app.getByRole("tabpanel").count(), 1);
      await app.screenshot({
        path: `${directory}/states-${tab.replaceAll(" ", "-")}-${width}.png`,
      });
    }
    await app.reload();
    await app.getByRole("tab", { name: "Ligação", exact: true }).waitFor();
    assert.equal(
      await app
        .getByRole("tab", { name: "Ligação", exact: true })
        .getAttribute("aria-selected"),
      "true",
      "state fragment restored",
    );
    console.log(
      "PASS reference geometry, navigation, TV tabs, favourites, persisted IPTV, system states",
      width,
    );
  }
  assert.deepEqual(errors, []);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    `${directory}/geometry.json`,
    JSON.stringify(report, null, 2),
  );
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
  await new Promise((r) => reference.close(r));
}
