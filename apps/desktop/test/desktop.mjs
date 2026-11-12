import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
const profile = mkdtempSync(join(tmpdir(), "zeus-desktop-"));
const packaged =
  process.env.ZEUS_PACKAGED_APP && resolve(process.env.ZEUS_PACKAGED_APP);
const env = {
  ...process.env,
  // Prove that the running app does not require external Node or Docker.
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  DATABASE_URL: "",
  ZEUS_DATA_DIR: profile,
  ZEUS_DATABASE_PATH: join(profile, "zeus.sqlite"),
  BETTER_AUTH_SECRET: "",
  ZEUS_ENCRYPTION_KEY: "",
  ZEUS_MOTOR_TOKEN: "",
  RESEND_API_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  TURNSTILE_SITE_KEY: "",
};
let app;
async function launch() {
  return electron.launch({
    ...(packaged
      ? { executablePath: join(packaged, "Contents/MacOS/Zeus"), args: [] }
      : { args: ["."] }),
    cwd: process.cwd(),
    env,
    timeout: 45000,
  });
}
try {
  if (packaged && process.platform === "darwin")
    execFileSync(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", packaged],
      {
        stdio: "inherit",
      },
    );
  if (packaged)
    execFileSync(
      join(
        packaged,
        "Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg",
      ),
      ["-version"],
      { stdio: "ignore" },
    );
  app = await launch();
  let page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Criar Administrador", exact: true })
    .waitFor({ timeout: 30000 });
  if (process.platform === "darwin") {
    const chrome = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { window: win.getBounds(), content: win.getContentBounds() };
    });
    assert.ok(
      chrome.content.y > chrome.window.y,
      "macOS title bar is outside all web content",
    );
    for (const zoom of [0.8, 1, 1.4]) {
      await app.evaluate(
        ({ BrowserWindow }, value) =>
          BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(value),
        zoom,
      );
      const inset = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        return w.getContentBounds().y - w.getBounds().y;
      });
      assert.ok(inset > 0, `native controls remain separate at zoom ${zoom}`);
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
    );
  }
  const origin = new URL(page.url()).origin;
  assert.equal(new URL(origin).hostname, "127.0.0.1");
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  await page.screenshot({ path: "/tmp/zeus-desktop.png" });
  const response = await page.request.post(origin + "/api/bootstrap", {
    headers: { origin },
    data: {
      name: "Desktop QA",
      email: "desktop@example.test",
      password: "desktop-test-password-only",
    },
  });
  assert.equal(response.status(), 200, await response.text());
  const pids = await app.evaluate(({ app }) =>
    app
      .getAppMetrics()
      .filter((p) => p.name === "Zeus API" || p.name === "Zeus Motor")
      .map((p) => p.pid),
  );
  assert.equal(pids.length, 2, "App owns its API and Motor");
  await app.close();
  app = undefined;
  for (let i = 0; i < 30; i++) {
    const alive = pids.some((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (!alive) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const pid of pids)
    assert.throws(() => process.kill(pid, 0), "Owned process exits with app");
  assert.equal(
    await fetch(origin + "/api/health")
      .then(() => true)
      .catch(() => false),
    false,
  );
  const database = new DatabaseSync(join(profile, "zeus.sqlite"));
  try {
    assert.equal(
      database.prepare('SELECT count(*) AS n FROM "user"').get().n,
      1,
    );
    assert.ok(
      database.prepare("SELECT count(*) AS n FROM addon").get().n > 300,
    );
    assert.equal(
      database.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
  } finally {
    database.close();
  }
  for (const key of ["auth-secret", "encryption-key", "motor-token"])
    assert.ok(existsSync(join(profile, key)));
  app = await launch();
  page = await app.firstWindow();
  await page
    .getByRole("heading", { name: /^(Entrar|Configurar autenticador)$/ })
    .waitFor({ timeout: 30000 });
  assert.equal(
    (
      await (
        await page.request.get(new URL(page.url()).origin + "/api/bootstrap")
      ).json()
    ).required,
    false,
  );
  assert.equal(
    new URL(page.url()).origin,
    origin,
    "Local links keep the same origin across restarts",
  );
  console.log(
    `PASS Electron ${packaged ? "packaged" : "compiled"}: isolated first run, SQLite account/seed persists, restart, owned services stop; no external Node/Docker`,
  );
} finally {
  await app?.close();
  rmSync(profile, { recursive: true, force: true });
}
