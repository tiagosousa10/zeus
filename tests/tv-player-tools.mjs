import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { tvFixture, startTVServer } from "./tv-fixture.mjs";

const server = await startTVServer(5194);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      let pip = null;
      window.pipRejected = false;
      window.qualityReads = 0;
      Object.defineProperties(document, {
        pictureInPictureEnabled: { value: true },
        pictureInPictureElement: { get: () => pip },
      });
      HTMLVideoElement.prototype.requestPictureInPicture = async function () {
        if (window.pipRejected) throw new Error("PiP unavailable");
        pip = this;
        this.dispatchEvent(new Event("enterpictureinpicture"));
      };
      document.exitPictureInPicture = async () => {
        const previous = pip;
        pip = null;
        previous?.dispatchEvent(new Event("leavepictureinpicture"));
      };
      HTMLVideoElement.prototype.getVideoPlaybackQuality = function () {
        window.qualityReads++;
        return { droppedVideoFrames: 2, totalVideoFrames: 100 };
      };
    });
    const fixture = await tvFixture(page);
    await page.goto("http://127.0.0.1:5194/tv#section=live&category=pt");
    await page.locator(".tv-channel-main").first().click();
    await expect(page.locator(".tv-player")).toBeVisible();
    await page.evaluate(() => {
      const video = document.querySelector(".tv-player video");
      Object.defineProperties(video, {
        videoWidth: { value: 1920 },
        videoHeight: { value: 1080 },
        currentTime: { value: 5 },
        buffered: { value: { length: 1, start: () => 0, end: () => 8 } },
      });
    });
    await page
      .getByRole("button", { name: "Informação técnica", exact: true })
      .click();
    const panel = page.getByRole("region", {
      name: "Informação técnica do vídeo",
    });
    await expect(panel).toContainText("1920 × 1080");
    await expect(panel).toContainText("3.0 s");
    await expect(panel).toContainText("2 / 100");
    assert.doesNotMatch(
      await panel.innerText(),
      /https?:|\/api\/|token|fixture-only/,
    );
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page
      .getByRole("button", { name: "Fechar informação técnica" })
      .click();
    const before = await page.evaluate(() => window.qualityReads);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.qualityReads), before);
    await page
      .getByRole("button", { name: "Janela flutuante", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sair da janela flutuante" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => document.exitPictureInPicture());
    await expect(
      page.getByRole("button", { name: "Janela flutuante", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    const starts = fixture.starts.length;
    await page.evaluate(() => {
      window.pipRejected = true;
    });
    await page
      .getByRole("button", { name: "Janela flutuante", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "A janela flutuante" }),
    ).toBeVisible();
    await expect(page.locator(".tv-player-error")).toHaveCount(0);
    assert.equal(
      fixture.starts.length,
      starts,
      "PiP rejection does not restart the provider session",
    );
    await page.evaluate(() => {
      window.pipRejected = false;
    });
    await page
      .getByRole("button", { name: "Janela flutuante", exact: true })
      .click();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    assert.equal(
      await page.evaluate(() => document.pictureInPictureElement),
      null,
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "TV tools passed: responsive metadata, private URL exclusion, polling cleanup, PiP state/rejection/cleanup.",
  );
} finally {
  await browser.close();
  server.kill();
}
