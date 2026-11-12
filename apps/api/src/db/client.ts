import { existsSync } from "node:fs";
import { config } from "../lib/config.js";
import { openLocalDatabase } from "./local.js";
import { seedAddons } from "./seed-addons.js";
// A legacy configuration must be migrated explicitly, never silently replaced by an empty account store.
if (process.env.DATABASE_URL && !existsSync(config.databasePath)) {
  throw new Error(
    "Foi encontrada uma configuração PostgreSQL. Executa npm run db:migrate antes de abrir a Zeus.",
  );
}
const local = openLocalDatabase(config.databasePath);
export const db = local.db;
export const query = local.query;
export const closeDatabase = local.close;
await seedAddons(db);
