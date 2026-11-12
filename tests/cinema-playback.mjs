import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

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
  for (const scenario of ["motor", "pending", "hls"]) {
    const pending = scenario === "pending",
      hls = scenario === "hls";
    let playlists = 0;
    const page = await browser.newPage({
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
          json: { meta: { id: "tt123", type: "movie", name: "Test Cinema" } },
        });
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/")
        return route.fulfill({
          contentType: "text/html",
          body: await server.transformIndexHtml(
            "/",
            '<div id="root"></div><script type="module" src="/@id/virtual:cinema-characterization"></script>',
          ),
        });
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
            preferences: {},
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
              hls
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
      hls ? "**/fixture.m3u8" : "**/api/motor/start",
    );
    await page.goto(origin + "/?id=tt123&type=movie");
    await started;
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
    "Cinema characterization passed: progress throttle/flush, pending-start cancellation and motor/native/HLS cleanup.",
  );
} finally {
  await browser.close();
  await server.close();
}
