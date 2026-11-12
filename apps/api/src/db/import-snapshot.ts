import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createDecipheriv, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  chmodSync,
  linkSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import { symmetricDecrypt } from "better-auth/crypto";
import { migrateDatabase } from "./migrations.js";

export const legacyTables = [
  "user",
  "account",
  "session",
  "verification",
  "twoFactor",
  "member_state",
  "invite",
  "addon",
  "verified_session",
] as const;
export type Snapshot = Record<
  (typeof legacyTables)[number],
  Record<string, unknown>[]
>;

/** Copy a consistent legacy snapshot. Never overwrite the destination or mutate the source. */
export async function importSnapshot(
  snapshot: Snapshot,
  destination: string,
  keys: { authSecret: string; encryptionKey: string },
) {
  if (existsSync(destination))
    throw new Error("O destino SQLite já existe; não foi substituído.");
  for (const table of legacyTables)
    if (!Array.isArray(snapshot[table]))
      throw new Error(`Tabela em falta: ${table}`);
  // Fail before publishing a database whose private content cannot be opened.
  try {
    for (const row of snapshot.member_state) {
      const [iv, tag, body] = String(row.ciphertext)
        .split(".")
        .map((value) => Buffer.from(value, "base64url"));
      if (
        String(row.ciphertext).split(".").length !== 3 ||
        iv.length !== 12 ||
        tag.length !== 16
      )
        throw new Error("Invalid encrypted state");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(keys.encryptionKey, "hex"),
        iv,
        { authTagLength: 16 },
      );
      decipher.setAuthTag(tag);
      JSON.parse(
        Buffer.concat([decipher.update(body), decipher.final()]).toString(
          "utf8",
        ),
      );
    }
    for (const row of snapshot.twoFactor) {
      await symmetricDecrypt({
        key: keys.authSecret,
        data: String(row.secret),
      });
      await symmetricDecrypt({
        key: keys.authSecret,
        data: String(row.backupCodes),
      });
    }
  } catch {
    throw new Error(
      "As chaves locais não conseguem abrir os dados antigos. Preserva as chaves originais antes de migrar.",
    );
  }
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.migration-${randomUUID()}`;
  const connection = new DatabaseSync(temporary);
  let closed = false;
  const counts: Record<string, number> = {};
  try {
    chmodSync(temporary, 0o600);
    connection.exec("PRAGMA foreign_keys = ON");
    migrateDatabase(connection);
    connection.exec("BEGIN IMMEDIATE");
    for (const table of legacyTables) {
      const columns = connection
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((row) => String(row.name));
      const insert = connection.prepare(
        `INSERT INTO "${table}" (${columns.map((name) => `"${name}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
      );
      for (const row of snapshot[table]) {
        const values = columns.map((name) => {
          const value = row[name];
          if (value === undefined)
            throw new Error(`Coluna em falta: ${table}.${name}`);
          if (value instanceof Date) return value.getTime();
          if (typeof value === "boolean") return Number(value);
          if (value !== null && typeof value === "object")
            return JSON.stringify(value);
          return value as SQLInputValue;
        });
        insert.run(...values);
      }
      counts[table] = Number(
        connection.prepare(`SELECT count(*) AS n FROM "${table}"`).get()!.n,
      );
      if (counts[table] !== snapshot[table].length)
        throw new Error(`Contagem inconsistente: ${table}`);
    }
    if (connection.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Referências inválidas na migração.");
    if (
      connection.prepare("PRAGMA integrity_check").get()!.integrity_check !==
      "ok"
    )
      throw new Error("Falha de integridade SQLite.");
    connection.exec("COMMIT");
    connection.close();
    closed = true;
    // Atomic publication, fails if another process created the destination meanwhile.
    linkSync(temporary, destination);
    return counts;
  } finally {
    if (!closed) connection.close();
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      try {
        unlinkSync(temporary + suffix);
      } catch {}
    }
  }
}
