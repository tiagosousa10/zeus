import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
const app = await electron.launch({
  args: ["."],
  cwd: process.cwd(),
  timeout: 45000,
});
try {
  const page = await app.firstWindow();
  // Do not depend on (or modify) an installation's existing member accounts.
  await page
    .getByRole("heading", { name: /^(Criar Administrador|Entrar)$/ })
    .waitFor({ timeout: 30000 });
  const origin = new URL(page.url()).origin;
  assert(["http://127.0.0.1:4310", "http://127.0.0.1:5174"].includes(origin));
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  await page.screenshot({ path: "/tmp/zeus-desktop.png" });
  console.log(
    `PASS Electron: entry screen, ${origin.endsWith(":4310") ? "compiled frontend" : "existing development frontend"}, no account changes`,
  );
} finally {
  await app.close();
}
