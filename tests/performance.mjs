import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { tvFixture } from "./tv-fixture.mjs";

// Production assets + isolated API fixtures: never contacts an IPTV provider.
const output =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  "/tmp/zeus-performance.json";
const check = process.argv.includes("--check");
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--config",
    "apps/web/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    "5198",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw Error("Performance preview failed to start");
    if (
      await fetch("http://127.0.0.1:5198")
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const screens = [];
  for (const [path, motion] of [
    ["/tv", "reduce"],
    ["/tv#section=movie", "reduce"],
    ["/portal", "reduce"],
    ["/portal", "no-preference"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      reducedMotion: motion,
    });
    const page = await context.newPage();
    await tvFixture(page);
    await page.addInitScript(() => {
      window.__draws = 0;
      for (const prototype of [
        WebGLRenderingContext.prototype,
        WebGL2RenderingContext.prototype,
      ]) {
        for (const method of ["drawArrays", "drawElements"]) {
          const original = prototype[method];
          prototype[method] = function (...args) {
            window.__draws++;
            return original.apply(this, args);
          };
        }
      }
    });
    const assets = new Map(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const pending = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname.endsWith(".js"))
        pending.push(
          response
            .body()
            .then((bytes) =>
              assets.set(new URL(response.url()).pathname, bytes.length),
            ),
        );
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.goto("http://127.0.0.1:5198" + path);
    await page
      .locator(path.startsWith("/tv") ? ".tv-app" : ".wordmark")
      .waitFor();
    await page.waitForTimeout(1800);
    const before = await cdp.send("Performance.getMetrics");
    const drawsBefore = await page.evaluate(() => window.__draws);
    await page.waitForTimeout(2000);
    const after = await cdp.send("Performance.getMetrics");
    const graphics = await page.evaluate(() => ({
      draws: window.__draws,
      pixels: [...document.querySelectorAll("canvas")].reduce(
        (n, c) => n + c.width * c.height,
        0,
      ),
    }));
    await Promise.all(pending);
    const metric = (values, name) =>
      values.metrics.find((m) => m.name === name)?.value || 0;
    screens.push({
      path,
      motion,
      jsBytes: [...assets.values()].reduce((a, b) => a + b, 0),
      assets: Object.fromEntries(assets),
      drawsPerSecond: (graphics.draws - drawsBefore) / 2,
      canvasPixels: graphics.pixels,
      taskMilliseconds: Math.round(
        (metric(after, "TaskDuration") - metric(before, "TaskDuration")) * 1000,
      ),
      jsHeapBytes: metric(after, "JSHeapUsedSize"),
      errors,
    });
    if (check) {
      const sample = screens.at(-1);
      assert.deepEqual(errors, [], `${path}: no browser errors`);
      if (path.startsWith("/tv")) {
        assert.ok(
          ![...assets.keys()].some((name) => /\/(hls|mpegts)-/.test(name)),
          "Browsing TV must not load playback engines",
        );
        assert.ok(sample.jsBytes < 550_000, "TV initial JavaScript budget");
      } else if (motion === "reduce") {
        assert.ok(
          ![...assets.keys()].some((name) => name.includes("three-")),
          "Reduced motion must not load Three.js",
        );
        assert.equal(sample.drawsPerSecond, 0);
        assert.ok(
          sample.canvasPixels <= 1,
          "No full-size idle lightning buffer",
        );
      } else {
        assert.ok(
          sample.drawsPerSecond > 0 && sample.drawsPerSecond <= 32,
          "Decorative rendering is active and limited to 30fps",
        );
        assert.ok(
          sample.canvasPixels <= 4_010_000,
          "Two decorative buffers fit the pixel budget",
        );
        // The first ambient strike starts within 3.2s and lasts 720ms.
        await page.waitForTimeout(1000);
        assert.ok(
          await page.evaluate(() => document.querySelector("#bolts").width > 1),
          "Lightning retains its usable buffer after a strike",
        );
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForTimeout(100);
        const paused = await page.evaluate(() => window.__draws);
        await page.waitForTimeout(200);
        assert.equal(
          await page.evaluate(() => window.__draws),
          paused,
          "Changing motion preference pauses rendering",
        );
        assert.equal(
          await page.evaluate(() => document.querySelector("#bolts").width),
          1,
        );
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.waitForTimeout(200);
        assert.ok(
          await page.evaluate(() => document.querySelector("#bolts").width > 1),
        );
        assert.ok(
          (await page.evaluate(() => window.__draws)) > paused,
          "Rendering resumes after restoring motion",
        );
      }
    }
    if (path === "/portal")
      await page.screenshot({
        path: output.replace(/\.json$/, "") + "-" + motion + ".png",
      });
    await context.close();
  }
  const motor = Array.from({ length: 5 }, () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-e",
          `const t=performance.now();require('./engine.js');console.log(JSON.stringify({milliseconds:performance.now()-t,rss:process.memoryUsage().rss,heap:process.memoryUsage().heapUsed,modules:Object.keys(require.cache).length,torrentLoaded:Object.keys(require.cache).some(p=>p.includes('/webtorrent/'))}));`,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
  if (check)
    assert.ok(
      motor.every((sample) => !sample.torrentLoaded),
      "Idle Motor does not load WebTorrent",
    );
  await writeFile(
    output,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        environment:
          "Headless Chrome, production build, local synthetic API, 1440x900 DPR2; CPU/heap are diagnostic samples, not device-wide guarantees.",
        screens,
        motor,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { output, screens: screens.map(({ assets, ...s }) => s), motor },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
