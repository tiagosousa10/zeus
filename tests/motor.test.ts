import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
const require = createRequire(import.meta.url);
const { startEngine } = require("../engine.js");
test("protected Motor rejects unauthenticated calls before mutations", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zeus-motor-test-"));
  const motor = startEngine({
    port: 0,
    token: "local-test-token",
    cacheDir: dir,
  });
  await once(motor.server, "listening");
  const url = `http://127.0.0.1:${motor.server.address().port}`;
  try {
    assert.equal((await fetch(url + "/clear")).status, 401);
    assert.equal((await fetch(url + "/status")).status, 401);
    assert.equal(
      (
        await fetch(url + "/status", {
          headers: { "X-Zeus-Motor-Token": "local-test-token" },
        })
      ).status,
      200,
    );
  } finally {
    motor.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
