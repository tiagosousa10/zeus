import postgres from "postgres";
import { createRequire } from "node:module";
import {
  importSnapshot,
  legacyTables,
  type Snapshot,
} from "../apps/api/src/db/import-snapshot.js";
const require = createRequire(import.meta.url);
require("./local-config.cjs").ensureLocalConfig();
const { config } = await import("../apps/api/src/lib/config.js");
const source =
  process.env.ZEUS_LEGACY_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgres://zeus:zeus_local@127.0.0.1:55439/zeus";
const sql = postgres(source, { max: 1, connect_timeout: 5 });
try {
  const snapshot = await sql.begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const snapshot = {} as Snapshot;
      for (const table of legacyTables)
        snapshot[table] = await tx.unsafe(`SELECT * FROM "${table}"`);
      return snapshot;
    },
  );
  const counts = await importSnapshot(snapshot, config.databasePath, config);
  console.log(
    JSON.stringify({ migrated: true, counts, sourceUnchanged: true }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "A migração falhou.");
  process.exitCode = 1;
} finally {
  await sql.end();
}
