import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("migration refuses to connect without an explicit legacy database URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "zeus-migration-config-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate-postgres.mts"],
      {
        env: {
          ...process.env,
          ZEUS_DATA_DIR: dir,
          ZEUS_LEGACY_DATABASE_URL: "",
          DATABASE_URL: "",
          ZEUS_ENCRYPTION_KEY: "",
          BETTER_AUTH_SECRET: "",
          ZEUS_MOTOR_TOKEN: "",
        },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ZEUS_LEGACY_DATABASE_URL.*obrigat/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
