import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, randomBytes } from "node:crypto";
import { symmetricEncrypt } from "better-auth/crypto";
import { openLocalDatabase } from "../src/db/local.js";
import {
  importSnapshot,
  legacyTables,
  type Snapshot,
} from "../src/db/import-snapshot.js";
import { user, memberState } from "../src/db/schema.js";

const person = (id: string) => ({
  id,
  name: id,
  email: `${id}@example.test`,
  createdAt: new Date(),
  updatedAt: new Date(),
});
test("async SQLite transactions isolate requests and roll back the whole operation", async () => {
  const local = openLocalDatabase(":memory:");
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>((resolve) => (started = resolve));
  const wait = new Promise<void>((resolve) => (release = resolve));
  try {
    const failed = local.db.transaction(async (tx) => {
      await tx.insert(user).values(person("rolled-back"));
      started();
      await wait;
      throw Error("rollback");
    });
    const rejection = assert.rejects(failed, /rollback/);
    await ready;
    const concurrent = local.db.transaction(async (tx) => {
      assert.deepEqual(await tx.select().from(user), []);
      await tx.insert(user).values(person("kept"));
    });
    release();
    await rejection;
    await concurrent;
    assert.deepEqual(
      (await local.db.select().from(user)).map((row) => row.id),
      ["kept"],
    );
  } finally {
    await local.close();
  }
});

test("SQLite persists types, constraints and schema across restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zeus-sqlite-test-"));
  const file = join(dir, "zeus.sqlite");
  let local = openLocalDatabase(file);
  try {
    const initial = person("persistent");
    await local.db.insert(user).values({ ...initial, active: false });
    await assert.rejects(
      local.db
        .insert(memberState)
        .values({ userId: "missing", ciphertext: "invalid" }),
    );
    await local.close();
    local = openLocalDatabase(file);
    const [row] = await local.db.select().from(user);
    assert.equal(row.active, false);
    assert.equal(row.createdAt.getTime(), initial.createdAt.getTime());
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal((await local.query("PRAGMA user_version"))[0].user_version, 1);
  } finally {
    await local.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migration preserves encrypted state/TOTP, refuses wrong keys and never overwrites a destination", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zeus-migrate-test-"));
  const destination = join(dir, "zeus.sqlite");
  const keys = {
    authSecret: randomBytes(32).toString("hex"),
    encryptionKey: randomBytes(32).toString("hex"),
  };
  const snapshot = Object.fromEntries(
    legacyTables.map((name) => [name, []]),
  ) as Snapshot;
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(keys.encryptionKey, "hex"),
      iv,
    );
  const body = Buffer.concat([
    cipher.update(JSON.stringify({ iptv: [{ password: "private-fixture" }] })),
    cipher.final(),
  ]);
  const ciphertext = [iv, cipher.getAuthTag(), body]
    .map((value) => value.toString("base64url"))
    .join(".");
  const now = new Date();
  snapshot.user.push({
    ...person("admin"),
    emailVerified: true,
    image: null,
    twoFactorEnabled: true,
    role: "admin",
    active: true,
  });
  snapshot.member_state.push({ user_id: "admin", ciphertext, updated_at: now });
  snapshot.twoFactor.push({
    id: "totp",
    userId: "admin",
    secret: await symmetricEncrypt({
      key: keys.authSecret,
      data: "totp-fixture",
    }),
    backupCodes: await symmetricEncrypt({
      key: keys.authSecret,
      data: '["backup-code"]',
    }),
    verified: true,
    failedVerificationCount: 0,
    lockedUntil: null,
  });
  try {
    await assert.rejects(
      importSnapshot(snapshot, destination, {
        ...keys,
        encryptionKey: "00".repeat(32),
      }),
      /chaves locais/,
    );
    assert.equal(existsSync(destination), false);
    await assert.rejects(
      importSnapshot(snapshot, destination, {
        ...keys,
        authSecret: "wrong-auth-secret",
      }),
      /chaves locais/,
    );
    const counts = await importSnapshot(snapshot, destination, keys);
    assert.equal(counts.user, 1);
    assert.equal(counts.member_state, 1);
    const local = openLocalDatabase(destination);
    try {
      assert.equal(
        (await local.db.select().from(user))[0].twoFactorEnabled,
        true,
      );
      assert.equal(
        (await local.db.select().from(memberState))[0].ciphertext,
        ciphertext,
      );
    } finally {
      await local.close();
    }
    await assert.rejects(
      importSnapshot(snapshot, destination, keys),
      /já existe/,
    );
    const invalid = { ...snapshot, user: [] };
    const orphan = join(dir, "orphan.sqlite");
    await assert.rejects(importSnapshot(invalid, orphan, keys), /FOREIGN KEY/);
    assert.equal(existsSync(orphan), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
