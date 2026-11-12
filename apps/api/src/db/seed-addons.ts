import seed from "./addons-seed.json" with { type: "json" };
import { addon } from "./schema.js";
import type { openLocalDatabase } from "./local.js";
import { configFields } from "../modules/addons/config.js";

type SeedAddon = {
  id: string;
  name: string;
  description: string;
  manifestUrl: string;
  resources: string[];
  configurationRequired: boolean;
  configurable: boolean;
  config: unknown;
};

// Varredura dos registos públicos do Stremio (filmes, séries e legendas), validada em 2026-11-12.
export async function seedAddons(
  db: ReturnType<typeof openLocalDatabase>["db"],
) {
  const rows = (seed as SeedAddon[]).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    manifestUrl: a.manifestUrl,
    status: "approved",
    configFields: configFields(a.config),
    configurationRequired: a.configurationRequired,
    configurable: a.configurable,
    resources: a.resources,
  }));
  return db.transaction(async (tx) => {
    let count = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const inserted = await tx
        .insert(addon)
        .values(rows.slice(i, i + 50))
        .onConflictDoNothing()
        .returning({ id: addon.id });
      count += inserted.length;
    }
    return count;
  });
}
