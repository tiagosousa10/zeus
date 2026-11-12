import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { tvFixture, settleTV } from "./tv-fixture.mjs";
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
  await tvFixture(app);
  const errors = [];
  app.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 375]) {
    await Promise.all([
      app.setViewportSize({ width, height: 900 }),
      ref.setViewportSize({ width, height: 900 }),
    ]);
    await app.goto("http://127.0.0.1:5181/tv");
    await app.locator(".tv-portal").first().waitFor();
    await settleTV(app);
    const appearance = await app.evaluate(() => ({
      background: getComputedStyle(document.querySelector(".tv-app"))
        .backgroundColor,
      width: document.documentElement.scrollWidth,
      portals: document.querySelectorAll(".tv-portal").length,
    }));
    assert.equal(appearance.width, width, "TV viewport has no overflow");
    assert.equal(
      appearance.background,
      "rgb(4, 7, 10)",
      "approved TV background",
    );
    assert(appearance.portals > 0, "Country portals remain available");
    assert.equal(
      await app
        .getByRole("button", { name: "Gerir pastas", exact: true })
        .count(),
      1,
    );
    await app.screenshot({ path: `${directory}/tv-implemented-${width}.png` });
    // TV's approved source is the nine-screen spec; obsolete tv.html geometry
    // is intentionally not used. All nine viewport checks live in test:tv.
    report.push({
      page: "tv",
      width,
      appearance,
      reference: "docs/superpowers/specs/2026-11-12-tv-iptv-design.md",
    });
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
      "PASS approved TV portal contracts and unchanged system-state reference geometry",
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
