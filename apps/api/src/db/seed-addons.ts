import { readFileSync } from "node:fs";
import type { Sql } from "postgres";
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
export async function seedAddons(sql: Sql) {
  const seed: SeedAddon[] = JSON.parse(
    readFileSync(new URL("./addons-seed.json", import.meta.url), "utf8"),
  );
  const rows = seed.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    manifest_url: a.manifestUrl,
    status: "approved",
    config_fields: JSON.stringify(configFields(a.config)),
    configuration_required: a.configurationRequired,
    configurable: a.configurable,
    resources: JSON.stringify(a.resources),
  }));
  const inserted =
    await sql`insert into addon ${sql(rows)} on conflict do nothing returning id`;
  return inserted.length;
}
