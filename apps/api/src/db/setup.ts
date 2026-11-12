import { readFileSync } from "node:fs";
import { sql } from "./client.js";
import { seedAddons } from "./seed-addons.js";
await sql.unsafe(readFileSync(new URL("./setup.sql", import.meta.url), "utf8"));
await seedAddons(sql);
await sql.end();
console.log("Zeus database ready");
