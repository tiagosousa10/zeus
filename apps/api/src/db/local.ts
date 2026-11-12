import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema.js";
import { migrateDatabase } from "./migrations.js";

/** One connection, with async transactions serialized across their entire lifetime.
 * Without this gate, a second request could execute inside another request's transaction.
 */
export function openLocalDatabase(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(filename);
  try {
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    connection.exec(
      "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
    );
    migrateDatabase(connection);
  } catch (error) {
    connection.close();
    throw error;
  }
  const scope = new AsyncLocalStorage<{ active: boolean }>();
  let queue: Promise<unknown> = Promise.resolve();
  let closed = false;
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (scope.getStore()?.active) return work();
    const result = queue.then(async () => {
      const context = { active: true };
      try {
        return await scope.run(context, work);
      } finally {
        context.active = false;
      }
    });
    queue = result.catch(() => {});
    return result;
  }
  const db = drizzle(
    async (query, params, method) =>
      exclusive(async () => {
        if (closed) throw new Error("Base de dados fechada.");
        const statement = connection.prepare(query);
        if (method === "run") {
          const result = statement.run(...params);
          return {
            rows: [],
            changes: Number(result.changes),
            lastInsertRowid: result.lastInsertRowid,
          };
        }
        statement.setReturnArrays(true);
        return {
          rows:
            method === "get"
              ? statement.get(...params)
              : statement.all(...params),
        } as { rows: any[] };
      }),
    { schema },
  );
  const transaction = db.transaction.bind(db);
  db.transaction = (work, options) =>
    exclusive(() => transaction(work, { behavior: "immediate", ...options }));
  return {
    db,
    query: <T = Record<string, any>>(
      query: string,
      params: SQLInputValue[] = [],
    ) => exclusive(async () => connection.prepare(query).all(...params) as T[]),
    close: () =>
      exclusive(async () => {
        if (!closed) {
          connection.close();
          closed = true;
        }
      }),
  };
}
