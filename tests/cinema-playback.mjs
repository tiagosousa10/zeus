import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";

const mediaDir = await mkdtemp(join(tmpdir(), "zeus-cinema-ui-"));
execFileSync(ffmpeg, [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc=size=320x180:rate=10",
  "-t",
  "120",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  join(mediaDir, "video.mp4"),
]);
const media = await readFile(join(mediaDir, "video.mp4"));

const server = await createServer({
  configFile: "apps/web/vite.config.ts",
  server: { port: 5197, strictPort: true, hmr: false },
  plugins: [
    {
      name: "cinema-characterization",
      resolveId(id) {
        if (id === "virtual:cinema-characterization") return id;
      },
      load(id) {
        if (id !== "virtual:cinema-characterization") return;
        return `import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import Player from '/src/features/cinema/pages/Player.tsx';
const root=createRoot(document.getElementById('root'));
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
window.unmountPlayer=()=>{root.unmount();client.clear()};
root.render(React.createElement(QueryClientProvider,{client},React.createElement(Player)));`;
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = "http://127.0.0.1:5197";
const hash = "a".repeat(40);
try {
  for (const scenario of [
    "controls-desktop",
    "controls-mobile",
    "motor",
    "pending",
    "hls",
    "next",
    "cancel",
    "disabled",
    "future",
  ]) {
    const controls = scenario.startsWith("controls");
    const pending = scenario === "pending",
      hls = scenario === "hls";
    const series = ["next", "cancel", "disabled", "future"].includes(scenario);
    let playlists = 0;
    const page = await browser.newPage({
      viewport: {
        width: scenario === "controls-mobile" ? 375 : 1440,
        height: 900,
      },
      hasTouch: scenario === "controls-mobile",
      reducedMotion: "reduce",
      permissions: ["local-network-access"],
    });
    const writes = [],
      stops = [],
      errors = [];
    let releaseStart;
    const gate = new Promise((resolve) => {
      releaseStart = resolve;
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((forceHls) => {
      if (forceHls) {
        const native = HTMLMediaElement.prototype.canPlayType;
        HTMLMediaElement.prototype.canPlayType = function (type) {
          return type === "application/vnd.apple.mpegurl"
            ? ""
            : native.call(this, type);
        };
      }
      const request = window.fetch;
      window.startAborted = false;
      window.fetch = (input, init) => {
        if (String(input).endsWith("/motor/start"))
          init.signal.addEventListener("abort", () => {
            window.startAborted = true;
          });
        return request(input, init);
      };
    }, hls);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "v3-cinemeta.strem.io")
        return route.fulfill({
          json: {
            meta: {
              id: "tt123",
              type: series ? "series" : "movie",
              name: "Test Cinema",
              videos: series
                ? [
                    {
                      id: "tt123:2:1",
                      season: 2,
                      episode: 1,
                      name: "Next season",
                      released:
                        scenario === "future" ? "2099-01-01" : "2020-01-01",
                    },
                    { id: "tt123:1:2", season: 1, episode: 2, name: "Current" },
                  ]
                : [],
            },
          },
        });
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/leitor")
        return route.fulfill({
          contentType: "text/html",
          body: "Next episode",
        });
      if (url.pathname === "/")
        return route.fulfill({
          contentType: "text/html",
          body: await server.transformIndexHtml(
            "/",
            '<link rel="stylesheet" href="/art/shared/zeus.css"><div id="root"></div><script type="module" src="/@id/virtual:cinema-characterization"></script>',
          ),
        });
      if (url.pathname === "/fixture.mp4") {
        const range = route
          .request()
          .headers()
          .range?.match(/bytes=(\d+)-(\d*)/);
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2]
          ? Math.min(Number(range[2]), media.length - 1)
          : media.length - 1;
        return route.fulfill({
          status: range ? 206 : 200,
          contentType: "video/mp4",
          headers: {
            "accept-ranges": "bytes",
            ...(range
              ? { "content-range": `bytes ${start}-${end}/${media.length}` }
              : {}),
          },
          body: media.subarray(start, end + 1),
        });
      }
      if (url.pathname === "/fixture.m3u8") {
        playlists++;
        return route.fulfill({
          contentType: "application/vnd.apple.mpegurl",
          body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n",
        });
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const path = url.pathname.slice(4);
      if (path === "/session")
        return route.fulfill({
          json: {
            user: {
              id: "test-member",
              twoFactorEnabled: true,
              twoFactorVerified: true,
            },
          },
        });
      if (path === "/state") {
        if (route.request().method() === "PATCH")
          writes.push(route.request().postDataJSON());
        return route.fulfill({
          json: {
            preferences: { autoplay: scenario !== "disabled" },
            progress: {},
            library: [],
            iptv: [],
            addons: [],
          },
        });
      }
      if (path === "/metadata") return route.fulfill({ json: { meta: null } });
      if (path === "/subtitles")
        return route.fulfill({ json: { subtitles: [] } });
      if (path === "/streams")
        return route.fulfill({
          json: {
            streams: [
              controls
                ? { url: origin + "/fixture.mp4", name: "Local video" }
                : hls
                  ? { url: origin + "/fixture.m3u8", name: "HLS fixture" }
                  : { infoHash: hash, fileIdx: 0, name: "Test source" },
            ],
          },
        });
      if (path === "/motor/start") {
        if (pending) await gate;
        return route
          .fulfill({
            json: {
              ok: true,
              infoHash: hash,
              fileIdx: 0,
              url: `/api/motor/stream/${hash}/0`,
            },
          })
          .catch(() => {});
      }
      if (path === "/motor/stop") {
        stops.push(route.request().postDataJSON());
        return route.fulfill({ json: { ok: true } });
      }
      if (path.startsWith("/motor/stream/"))
        return route.fulfill({ contentType: "video/mp4", body: "" });
      throw new Error("Unexpected test API request: " + path);
    });
    const started = page.waitForRequest(
      controls
        ? "**/fixture.mp4"
        : hls
          ? "**/fixture.m3u8"
          : "**/api/motor/start",
    );
    await page.goto(
      origin +
        (series ? "/?id=tt123&type=series&s=1&e=2" : "/?id=tt123&type=movie"),
    );
    await started;
    if (controls) {
      await expect
        .poll(() => page.locator("video").evaluate((v) => v.readyState))
        .toBeGreaterThan(1);
      const video = page.locator("video");
      if (await video.evaluate((v) => v.paused))
        await page
          .getByRole("button", { name: "Reproduzir", exact: true })
          .click();
      await expect
        .poll(() => video.evaluate((v) => v.currentTime))
        .toBeGreaterThan(1);
      await page.getByRole("button", { name: "Pausar", exact: true }).click();
      await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
      await page.waitForTimeout(200);
      await expect(video).toHaveCSS("filter", "none");
      const centreIsVideo = await video.evaluate((v) => {
        const r = v.getBoundingClientRect();
        return (
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === v
        );
      });
      assert.ok(
        centreIsVideo,
        "pause leaves the frame unobscured and clickable",
      );
      await page
        .getByRole("button", { name: "Opções do leitor", exact: true })
        .click();
      await page.getByRole("button", { name: /^Velocidade/ }).click();
      await expect(
        page.getByRole("region", { name: "Velocidade", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Opções do leitor", exact: true }),
      ).toBeFocused();
      await page.getByRole("button", { name: "Legendas", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Legendas", exact: true }),
      ).toContainText("Nem esta Fonte");
      await page.locator('button[aria-label="Fechar menu"]').click();
      await expect(
        page.getByRole("button", { name: "Legendas", exact: true }),
      ).toBeFocused();
      await page
        .getByRole("button", { name: "Opções do leitor", exact: true })
        .click();
      await page.getByRole("button", { name: "Legendas", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Legendas", exact: true }),
      ).toBeFocused();
      const timeline = page.getByRole("slider", { name: "Posição no vídeo" });
      const before = await video.evaluate((v) => v.currentTime);
      await timeline.focus();
      await page.keyboard.press("ArrowRight");
      const after = await video.evaluate((v) => v.currentTime);
      assert.ok(
        after - before < 1,
        "range keyboard does not trigger the ten-second shortcut",
      );
      const bounds = await timeline.boundingBox();
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      await expect(page.locator(".p-tip")).toBeVisible();
      await expect(page.locator(".p-tip")).toContainText("1:00");
      await expect
        .poll(() => page.locator(".p-buf").count())
        .toBeGreaterThan(0);
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width * 0.75,
        bounds.y + bounds.height / 2,
      );
      await expect(timeline).toBeVisible();
      await page.mouse.up();
      await expect
        .poll(() => video.evaluate((v) => Math.round(v.currentTime)))
        .toBeGreaterThan(80);
      await page
        .getByRole("button", { name: "Reproduzir", exact: true })
        .click();
      await page.clock.install();
      await page.getByRole("button", { name: "Legendas", exact: true }).click();
      await page.mouse.move(500, 100);
      await page.clock.runFor(4100);
      await expect(
        page.getByRole("region", { name: "Legendas", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await page.clock.runFor(4100);
      await expect(
        page.getByRole("button", { name: "Legendas", exact: true }),
      ).toBeFocused();
      await expect(page.locator("main")).not.toHaveClass(/is-idle/);
      await page.evaluate(() => document.activeElement.blur());
      await page.locator("video").dispatchEvent("pointermove");
      await page.clock.runFor(4100);
      await expect(page.locator("main")).toHaveClass(/is-idle/);
      await expect(page.locator("footer")).toHaveAttribute("inert", "");
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("button", { name: "Controlos do leitor" }),
      ).toBeFocused();
      await page.getByRole("button", { name: "Pausar", exact: true }).click();
      await mkdir("/tmp/zeus-cinema-player", { recursive: true });
      await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
      await expect(
        page.getByRole("button", { name: "Reproduzir", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `/tmp/zeus-cinema-player/${scenario}.png`,
      });
      await page
        .getByRole("button", { name: "Opções do leitor", exact: true })
        .click();
      await page.screenshot({
        path: `/tmp/zeus-cinema-player/${scenario}-options.png`,
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Ecrã inteiro", exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => !!document.fullscreenElement))
        .toBe(true);
      await page.evaluate(() => document.exitFullscreen());
      if (scenario === "controls-mobile") {
        await page.touchscreen.tap(180, 450);
        await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
        await page.touchscreen.tap(180, 450);
        await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true);
      }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      for (const invalidDuration of [0, NaN, Infinity]) {
        await video.evaluate((v, value) => {
          Object.defineProperty(v, "duration", {
            configurable: true,
            value: value === "NaN" ? NaN : value === "Infinity" ? Infinity : 0,
          });
          v.dispatchEvent(new Event("durationchange"));
        }, String(invalidDuration));
        await expect(timeline).toBeDisabled();
      }
      await page.evaluate(() => window.unmountPlayer());
      assert.deepEqual(errors, []);
      await page.close();
      continue;
    }
    if (series) {
      await expect(page.locator("video")).toHaveAttribute(
        "src",
        `/api/motor/stream/${hash}/0`,
      );
      if (scenario !== "future")
        await expect(page.locator(".player-next")).toHaveCount(0);
      await page.clock.install();
      await page.evaluate(() => {
        const video = document.querySelector("video");
        Object.defineProperties(video, {
          duration: { configurable: true, value: 120 },
          currentTime: { configurable: true, value: 120 },
          ended: { configurable: true, value: true },
        });
        video.dispatchEvent(new Event("loadedmetadata"));
        video.dispatchEvent(new Event("timeupdate"));
        video.dispatchEvent(new Event("ended"));
      });
      if (scenario === "future") {
        await expect(page.locator(".player-next")).toHaveCount(0);
      } else {
        await expect(
          page.getByRole("link", { name: "Reproduzir próximo episódio" }),
        ).toHaveAttribute("href", "/leitor?id=tt123&type=series&s=2&e=1");
        if (scenario === "disabled") {
          await expect(page.locator(".player-next [role=status]")).toHaveCount(
            0,
          );
        } else {
          await expect(
            page.locator(".player-next [role=status]"),
          ).toContainText("15 s");
          if (scenario === "cancel") {
            await page
              .getByRole("button", { name: "Cancelar", exact: true })
              .click();
            await page.clock.runFor(16000);
            assert.ok(page.url().includes("s=1&e=2"));
            await page
              .getByRole("button", { name: "Retomar reprodução automática" })
              .click();
            await expect(
              page.locator(".player-next [role=status]"),
            ).toContainText("15 s");
          }
          await page.clock.runFor(15000);
          await expect(page).toHaveURL(
            origin + "/leitor?id=tt123&type=series&s=2&e=1",
          );
        }
      }
      if (["future", "disabled"].includes(scenario)) {
        await page.clock.runFor(16000);
        assert.ok(page.url().includes("s=1&e=2"));
        await page.evaluate(() => window.unmountPlayer());
      }
      assert.deepEqual(errors, []);
      await page.close();
      continue;
    }
    if (hls) {
      await expect(page.locator("video")).toHaveAttribute("src", /^blob:/);
      await page.evaluate(() => {
        window.testVideo = document.querySelector("video");
        window.unmountPlayer();
      });
      assert.equal(
        await page.evaluate(() => window.testVideo.hasAttribute("src")),
        false,
      );
      const before = playlists;
      await page.clock.install();
      await page.clock.fastForward(30000);
      assert.equal(
        playlists,
        before,
        "destroyed HLS stops refreshing its manifest",
      );
      assert.equal(writes.length, 0);
    } else if (!pending) {
      await expect(page.locator("video")).toHaveAttribute(
        "src",
        `/api/motor/stream/${hash}/0`,
      );
      await page.clock.install();
      await page.evaluate(() => {
        window.testVideo = document.querySelector("video");
        Object.defineProperties(window.testVideo, {
          duration: { configurable: true, value: 120 },
          currentTime: { configurable: true, writable: true, value: 20 },
          ended: { configurable: true, value: false },
        });
        window.testVideo.dispatchEvent(new Event("timeupdate"));
      });
      await expect.poll(() => writes.length).toBe(1);
      await page.evaluate(() => {
        window.testVideo.currentTime = 25;
        window.testVideo.dispatchEvent(new Event("timeupdate"));
      });
      assert.equal(
        writes.length,
        1,
        "timeupdates within ten seconds are throttled",
      );
      await page.clock.fastForward(10001);
      await page.evaluate(() => {
        window.testVideo.currentTime = 35;
        window.testVideo.dispatchEvent(new Event("timeupdate"));
      });
      await expect.poll(() => writes.length).toBe(2);
      assert.equal(writes[1].progress.tt123.position, 35);
      await page.evaluate(() => window.unmountPlayer());
      await expect.poll(() => writes.length).toBe(3);
      assert.equal(writes[2].progress.tt123.duration, 120);
      assert.equal(
        await page.evaluate(() => window.testVideo.hasAttribute("src")),
        false,
        "unmount releases the media source",
      );
    } else {
      await page.evaluate(() => window.unmountPlayer());
      await expect
        .poll(() => page.evaluate(() => window.startAborted))
        .toBe(true);
      releaseStart();
      assert.equal(
        writes.length,
        0,
        "pending playback must not invent progress",
      );
    }
    if (hls) assert.equal(stops.length, 0, "direct HLS never owns the motor");
    else {
      await expect.poll(() => stops.length).toBe(1);
      assert.equal(stops[0].infoHash, hash, "unmount stops the owned torrent");
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Cinema passed: desktop/mobile controls, pause, timeline, focus, fullscreen/touch, progress, autoplay and motor/HLS cleanup.",
  );
} finally {
  await browser.close();
  await server.close();
  await rm(mediaDir, { recursive: true, force: true });
}
