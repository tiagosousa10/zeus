import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
// Local keys are generated once and never committed; deployments supply environment secrets.
const dir =
  process.env.ZEUS_DATA_DIR ||
  join(
    process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "Zeus",
  );
mkdirSync(dir, { recursive: true, mode: 0o700 });
function localSecret(name: string) {
  const path = resolve(dir, name);
  if (!existsSync(path)) {
    try {
      writeFileSync(path, randomBytes(32).toString("hex"), {
        mode: 0o600,
        flag: "wx",
      });
    } catch (e) {
      if (!existsSync(path)) throw e;
    }
  }
  return readFileSync(path, "utf8").trim();
}
export const config = {
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://zeus:zeus_local@127.0.0.1:55439/zeus",
  authSecret: process.env.BETTER_AUTH_SECRET || localSecret("auth-secret"),
  encryptionKey:
    process.env.ZEUS_ENCRYPTION_KEY || localSecret("encryption-key"),
  origin: process.env.ZEUS_WEB_ORIGIN || "http://127.0.0.1:5174",
  apiUrl: process.env.BETTER_AUTH_URL || "http://127.0.0.1:5174",
};
if (
  config.encryptionKey.length !== 64 ||
  !/^[a-f0-9]+$/i.test(config.encryptionKey)
)
  throw new Error("ZEUS_ENCRYPTION_KEY must be 64 hexadecimal characters");
