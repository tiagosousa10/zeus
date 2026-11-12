// Rebuild the macOS icon without altering the original Zeus artwork.
// Run manually with `node scripts/build-icon.mjs` (requires local Chrome).
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(
  new URL("../images-zeus/zeus-4.png", import.meta.url),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(
    async (data) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      // Continuous corner profile, 84% footprint and an equal transparent margin.
      const tile = new Path2D(
        "M 290 82 H 734 C 879 82 942 145 942 290 V 734 " +
          "C 942 879 879 942 734 942 H 290 C 145 942 82 879 82 734 " +
          "V 290 C 82 145 145 82 290 82 Z",
      );
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.22)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = "#202329";
      ctx.fill(tile);
      ctx.restore();
      ctx.save();
      ctx.clip(tile);
      ctx.drawImage(image, 82, 82, 860, 860);
      const rim = ctx.createLinearGradient(0, 82, 0, 942);
      rim.addColorStop(0, "rgba(255,255,255,.48)");
      rim.addColorStop(0.45, "rgba(255,255,255,.12)");
      rim.addColorStop(1, "rgba(0,0,0,.5)");
      ctx.strokeStyle = rim;
      ctx.lineWidth = 4;
      ctx.stroke(tile);
      ctx.restore();
      if (ctx.getImageData(0, 0, 1, 1).data[3] !== 0)
        throw new Error("Icon must preserve transparent corners");
      return canvas.toDataURL("image/png").split(",")[1];
    },
    `data:image/png;base64,${source.toString("base64")}`,
  );
  await writeFile(
    new URL("../build/icon.png", import.meta.url),
    Buffer.from(png, "base64"),
  );
  console.log(
    "Built 1024px macOS icon with transparent margin and rounded corners.",
  );
} finally {
  await browser.close();
}
