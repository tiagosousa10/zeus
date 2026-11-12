import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

for (const entry of [
  "apps/api/src/lib/config.ts",
  "apps/desktop/src/local-config.cjs",
]) {
  test(`${entry} rejects an environment key conflicting with the saved profile`, () => {
    const dir = mkdtempSync(join(tmpdir(), "zeus-config-"));
    try {
      writeFileSync(join(dir, "encryption-key"), "a".repeat(64), {
        mode: 0o600,
      });
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `const m = await import(${JSON.stringify(resolve(entry))}); if (m.ensureLocalConfig) m.ensureLocalConfig({loadEnv:false});`,
        ],
        {
          env: {
            ...process.env,
            ZEUS_DATA_DIR: dir,
            ZEUS_ENCRYPTION_KEY: "b".repeat(64),
            BETTER_AUTH_SECRET: "",
            ZEUS_MOTOR_TOKEN: "",
          },
          encoding: "utf8",
        },
      );
      assert.notEqual(
        result.status,
        0,
        "must reject mismatched encryption key",
      );
      assert.match(result.stderr, /não corresponde/);
      assert.equal(
        readFileSync(join(dir, "encryption-key"), "utf8"),
        "a".repeat(64),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
test("API-created keys are persisted privately and reused by the desktop", () => {
  const dir = mkdtempSync(join(tmpdir(), "zeus-config-"));
  try {
    const env = {
      ...process.env,
      ZEUS_DATA_DIR: dir,
      ZEUS_ENCRYPTION_KEY: "",
      BETTER_AUTH_SECRET: "",
      ZEUS_MOTOR_TOKEN: "",
    };
    for (const entry of [
      "apps/api/src/lib/config.ts",
      "apps/desktop/src/local-config.cjs",
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `const m = await import(${JSON.stringify(resolve(entry))}); if (m.ensureLocalConfig) m.ensureLocalConfig({loadEnv:false});`,
        ],
        { env, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(
        readFileSync(join(dir, "encryption-key"), "utf8"),
        /^[a-f0-9]{64}$/,
      );
      assert.equal(statSync(join(dir, "encryption-key")).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
