import type { DatabaseSync } from "node:sqlite";

// Append migrations; never edit an already released version.
const migrations = [
  String.raw`
CREATE TABLE "user" (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, "emailVerified" INTEGER NOT NULL DEFAULT 0, image TEXT, "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL, "twoFactorEnabled" INTEGER DEFAULT 0, role TEXT NOT NULL DEFAULT 'member', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE session (id TEXT PRIMARY KEY NOT NULL, "expiresAt" INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL, "ipAddress" TEXT, "userAgent" TEXT, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE INDEX session_user_idx ON session("userId");
CREATE TABLE account (id TEXT PRIMARY KEY NOT NULL, "accountId" TEXT NOT NULL, "providerId" TEXT NOT NULL, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "accessToken" TEXT, "refreshToken" TEXT, "idToken" TEXT, "accessTokenExpiresAt" INTEGER, "refreshTokenExpiresAt" INTEGER, scope TEXT, password TEXT, "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL);
CREATE INDEX account_user_idx ON account("userId");
CREATE TABLE verification (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, "expiresAt" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL);
CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE TABLE "twoFactor" (id TEXT PRIMARY KEY NOT NULL, secret TEXT NOT NULL, "backupCodes" TEXT NOT NULL, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, verified INTEGER DEFAULT 0, "failedVerificationCount" INTEGER DEFAULT 0, "lockedUntil" INTEGER);
CREATE INDEX two_factor_user_idx ON "twoFactor"("userId");
CREATE TABLE member_state (user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, ciphertext TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000));
CREATE TABLE invite (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL REFERENCES "user"(id), created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000), expires_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE addon (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', manifest_url TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', config_fields TEXT NOT NULL DEFAULT '[]', configuration_required INTEGER NOT NULL DEFAULT 0, configurable INTEGER NOT NULL DEFAULT 0, resources TEXT NOT NULL DEFAULT '["stream"]');
CREATE TABLE verified_session (session_id TEXT PRIMARY KEY NOT NULL REFERENCES session(id) ON DELETE CASCADE);
`,
];

export function migrateDatabase(connection: DatabaseSync) {
  connection.exec("BEGIN IMMEDIATE");
  try {
    const version = Number(
      connection.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version > migrations.length)
      throw new Error(
        "Esta base de dados pertence a uma versão mais recente da Zeus.",
      );
    for (let i = version; i < migrations.length; i++) {
      connection.exec(migrations[i]);
      connection.exec(`PRAGMA user_version = ${i + 1}`);
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}
