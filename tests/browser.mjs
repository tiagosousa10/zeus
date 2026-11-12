import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const dataDir = mkdtempSync(join(tmpdir(), "zeus-browser-"));
const env = {
  ...process.env,
  DATABASE_URL: "",
  ZEUS_DATA_DIR: dataDir,
  ZEUS_DATABASE_PATH: join(dataDir, "zeus.sqlite"),
  ZEUS_WEB_ORIGIN: "http://127.0.0.1:5175",
  BETTER_AUTH_URL: "http://127.0.0.1:5175",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  ZEUS_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  PORT: "4311",
  // Chaves de teste oficiais da Cloudflare: o widget e o siteverify passam sempre.
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  RESEND_API_KEY: "",
  RESEND_FROM: "",
};
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/api/src/index.ts"], {
    env,
    stdio: "ignore",
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts"],
    {
      env: { ...env, WEB_PORT: "5175", API_TARGET: "http://127.0.0.1:4311" },
      stdio: "ignore",
    },
  ),
];
let browser;
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = Buffer.from(bits.match(/.{8}/g).map((s) => parseInt(s, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", bytes).update(counter).digest();
  const off = h[19] & 15;
  return String((h.readUInt32BE(off) & 0x7fffffff) % 1e6).padStart(6, "0");
}
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5175/api/bootstrap")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5175/entrada");
  await page.getByRole("heading", { name: "Criar Administrador" }).waitFor();
  await page.getByLabel("Nome", { exact: true }).fill("Guardião Teste");
  await page.getByLabel("Email", { exact: true }).fill("qa@example.test");
  await page
    .getByLabel("Palavra-passe", { exact: true })
    .fill("Only-for-local-tests-2026");
  await page.getByRole("button", { name: "Criar Administrador" }).click();
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  await page.getByText("Usar chave manual").click();
  const secret = await page.locator("details code").innerText();
  await page.getByLabel("Guardei os códigos de recuperação.").check();
  const code = totp(secret);
  for (let i = 0; i < code.length; i++)
    await page
      .getByLabel(`Dígito ${i + 1} de 6`, { exact: true })
      .fill(code[i]);
  await page.getByRole("button", { name: "Verificar", exact: true }).click();
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await page
    .getByRole("group", { name: "Áudio", exact: true })
    .getByRole("button", { name: "English" })
    .click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Chave TMDB", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("heading", { name: "Add-ons", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Mais tarde", exact: true }).click();
  await page
    .getByRole("heading", { name: "Tudo pronto", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Entrar no Zeus", exact: true })
    .click();
  await page.waitForURL("**/portal");
  const stateResponse = await context.request.get(
    "http://127.0.0.1:5175/api/state",
  );
  assert.equal(stateResponse.status(), 200);
  const savedState = await stateResponse.json();
  assert.equal(savedState.onboardingDone, true);
  assert.deepEqual(savedState.preferences.audioLanguages, [
    "pt-PT",
    "original",
    "en",
  ]);
  assert.deepEqual(savedState.preferences.subtitleLanguages, ["pt-PT"]);
  mkdirSync("/tmp/zeus-implemented", { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      reducedMotion: width === 375 ? "reduce" : "no-preference",
    });
    for (const route of [
      "/onboarding",
      "/portal",
      "/cinema",
      "/explorar",
      "/titulo?id=tt0111161&type=movie",
      "/leitor?id=tt0111161&type=movie",
      "/tv",
      "/addons",
      "/conta",
      "/admin",
      "/estados",
      "/guia",
    ]) {
      await page.goto("http://127.0.0.1:5175" + route, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1200);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
        route + " overflow",
      );
      assert(
        !(await page
          .getByText("Algo interrompeu a viagem.", { exact: true })
          .count()),
        route + " crashed",
      );
      assert.equal(
        await page.locator("vite-error-overlay").count(),
        0,
        route + " Vite error",
      );
      await page.screenshot({
        path: `/tmp/zeus-implemented/${route.split("?")[0].slice(1)}-${width}.png`,
      });
      console.log("PASS", width, route);
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS real bootstrap → TOTP → onboarding and 12 protected screens, desktop/mobile",
  );
} finally {
  await browser?.close();
  children.forEach((c) => c.kill("SIGTERM"));
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true });
}
