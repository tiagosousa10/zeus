import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  nativeEnvironment,
  serviceEnvironment,
} from "../packages/local-config/process-env.cjs";
test("a native child receives locale but no application credentials or injection flags", () => {
  const env = nativeEnvironment({
    PATH: process.env.PATH,
    LANG: "C",
    BETTER_AUTH_SECRET: "test-only",
    ZEUS_ENCRYPTION_KEY: "test-only",
    NODE_OPTIONS: "--invalid-flag",
    DYLD_INSERT_LIBRARIES: "invalid",
  });
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      "console.log(JSON.stringify({lang:process.env.LANG,secret:process.env.BETTER_AUTH_SECRET,key:process.env.ZEUS_ENCRYPTION_KEY,dyld:process.env.DYLD_INSERT_LIBRARIES}))",
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { lang: "C" });
  assert.deepEqual(
    serviceEnvironment(["ZEUS_MOTOR_TOKEN"], {
      ZEUS_MOTOR_TOKEN: "test-token",
      RESEND_API_KEY: "test-mail",
    }),
    { ZEUS_MOTOR_TOKEN: "test-token" },
  );
});
