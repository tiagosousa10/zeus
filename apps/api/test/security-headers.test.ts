import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "zeus-headers-"));
process.env.ZEUS_DATA_DIR = dir;
process.env.ZEUS_DATABASE_PATH = join(dir, "test.sqlite");
process.env.ZEUS_WEB_ORIGIN = "http://127.0.0.1:43219";
process.env.BETTER_AUTH_URL = process.env.ZEUS_WEB_ORIGIN;
delete process.env.ZEUS_DEVELOPMENT;
const { app } = await import("../src/app.js");
const { closeDatabase } = await import("../src/db/client.js");
after(async () => {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});
test("production API rejects the unrelated development origin", async () => {
  const r = await app.request("/api/bootstrap", {
    method: "POST",
    headers: {
      origin: "http://localhost:5174",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("responses forbid framing, sniffing and third-party referrer leakage", async () => {
  const r = await app.request("/api/health");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.match(
    r.headers.get("content-security-policy") || "",
    /frame-ancestors 'none'/,
  );
  assert.doesNotMatch(
    r.headers.get("content-security-policy") || "",
    /unsafe-eval/,
  );
});
