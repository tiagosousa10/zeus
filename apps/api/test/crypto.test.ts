import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "zeus-crypto-"));
process.env.ZEUS_DATA_DIR = dir;
process.env.ZEUS_ENCRYPTION_KEY = "a".repeat(64);
process.env.BETTER_AUTH_SECRET = "b".repeat(64);
const { encrypt, decrypt } = await import("../src/lib/crypto.js");
test("private state rejects truncated authentication tags", () => {
  const value = encrypt({ private: "state" });
  assert.deepEqual(decrypt(value), { private: "state" });
  const [iv, tag, body] = value.split(".");
  const truncated = Buffer.from(tag, "base64url")
    .subarray(0, 4)
    .toString("base64url");
  assert.throws(() => decrypt([iv, truncated, body].join(".")));
});

after(() => rmSync(dir, { recursive: true, force: true }));
test("migration rejects state with a truncated authentication tag before publishing", async () => {
  const { importSnapshot, legacyTables } =
    await import("../src/db/import-snapshot.js");
  const snapshot: Record<string, any[]> = Object.fromEntries(
    legacyTables.map((t) => [t, []]),
  );
  const [iv, tag, body] = encrypt({ private: "state" }).split(".");
  const ciphertext = [
    iv,
    Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url"),
    body,
  ].join(".");
  snapshot.member_state = [{ user_id: "missing", ciphertext, updated_at: 0 }];
  await assert.rejects(
    importSnapshot(snapshot as any, join(dir, "migrated.sqlite"), {
      authSecret: "b".repeat(64),
      encryptionKey: "a".repeat(64),
    }),
    /chaves locais/,
  );
});
