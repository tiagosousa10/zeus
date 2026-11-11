import { chromium } from "@playwright/test";
import postgres from "postgres";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const schema = "browser_" + randomBytes(6).toString("hex");
const dbUrl = "postgres://zeus:zeus_local@127.0.0.1:55439/zeus";
const control = postgres(dbUrl, { max: 1, onnotice: () => {} });
await control.unsafe(`create schema ${schema}`);
const u = new URL(dbUrl);
u.searchParams.set("options", `-c search_path=${schema}`);
const db = postgres(u.toString(), { max: 1, onnotice: () => {} });
await db.unsafe(readFileSync("apps/api/src/db/setup.sql", "utf8"));
const env = {
  ...process.env,
  DATABASE_URL: u.toString(),
  ZEUS_WEB_ORIGIN: "http://127.0.0.1:5175",
  BETTER_AUTH_URL: "http://127.0.0.1:5175",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  ZEUS_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  PORT: "4311",
  TURNSTILE_SECRET_KEY: "",
  TURNSTILE_SITE_KEY: "",
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
  await page.getByRole("heading", { name: "O primeiro guardião." }).waitFor();
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
  await page
    .getByLabel("Código de autenticação", { exact: true })
    .fill(totp(secret));
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await page.waitForURL("**/onboarding");
  const stateResponse = await context.request.patch(
    "http://127.0.0.1:5175/api/state",
    {
      data: {
        onboardingDone: true,
        preferences: { audioLanguages: ["pt"], subtitleLanguages: ["pt"] },
      },
    },
  );
  assert.equal(stateResponse.status(), 200);
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
  await db.end();
  await new Promise((r) => setTimeout(r, 300));
  await control.unsafe(`drop schema ${schema} cascade`);
  await control.end();
}
