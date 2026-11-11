import { readFileSync } from "node:fs";
import { sql } from "./client.js";
await sql.unsafe(readFileSync(new URL("./setup.sql", import.meta.url), "utf8"));
await sql.end();
console.log("Zeus database ready");
