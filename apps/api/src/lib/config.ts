import { join } from "node:path";
import { ensureLocalConfig } from "../../../../packages/local-config/index.cjs";
const dir = ensureLocalConfig();
export const config = {
  dataDir: dir,
  databasePath: process.env.ZEUS_DATABASE_PATH || join(dir, "zeus.sqlite"),
  authSecret: process.env.BETTER_AUTH_SECRET!,
  encryptionKey: process.env.ZEUS_ENCRYPTION_KEY!,
  origin: process.env.ZEUS_WEB_ORIGIN || "http://127.0.0.1:5174",
  apiUrl: process.env.BETTER_AUTH_URL || "http://127.0.0.1:5174",
};

export const development = process.env.ZEUS_DEVELOPMENT === "1";
export const trustedOrigins = [
  config.origin,
  ...(development ? ["http://localhost:5174", "http://127.0.0.1:5174"] : []),
];
