import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../lib/config.js";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { fetchCatalog, fetchMovie, fetchSeries } from "./provider.js";
import type { IPTVList, TVCatalog, TVMovieDetail, TVSeriesDetail } from "./types.js";

const CATALOG_TTL = 6 * 3600_000;
const DETAIL_TTL = 12 * 3600_000;
const dir = join(config.dataDir, "iptv-cache");

type Entry = { value: unknown; expires: number };
const memory = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();
let clock = () => Date.now();

export function setClock(f: () => number): void {
  clock = f;
}
export function clearMemoryCache(): void {
  memory.clear();
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const listKey = (userId: string, list: IPTVList) =>
  sha256([userId, list.id, list.type, list.url, list.username ?? "", list.password ?? ""].join("|"));

function readDisk(key: string): Entry | undefined {
  try {
    return decrypt(readFileSync(join(dir, `${key}.bin`), "utf8")) as Entry;
  } catch {
    return undefined;
  }
}

function writeDisk(key: string, entry: Entry): void {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, `${key}.bin`), encrypt(entry), { mode: 0o600 });
  } catch {}
}

async function cached<T>(key: string, ttl: number, load: (now: number) => Promise<T>, force = false): Promise<T> {
  if (!force) {
    const hit = memory.get(key) ?? readDisk(key);
    if (hit && hit.expires > clock()) {
      memory.set(key, hit);
      return hit.value as T;
    }
  }
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = (async () => {
    const now = clock();
    const value = await load(now);
    const entry = { value, expires: now + ttl };
    memory.set(key, entry);
    writeDisk(key, entry);
    return value;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function getCatalog(userId: string, list: IPTVList, opts: { force?: boolean } = {}): Promise<TVCatalog> {
  return cached(listKey(userId, list), CATALOG_TTL, (now) => fetchCatalog(list, now), opts.force);
}

export async function getMovie(userId: string, list: IPTVList, id: string): Promise<TVMovieDetail | undefined> {
  const base = (await getCatalog(userId, list)).movie.items.find((m) => m.id === id);
  if (!base) return undefined;
  return cached(sha256(`${listKey(userId, list)}:movie:${id}`), DETAIL_TTL, () => fetchMovie(list, base));
}

export async function getSeries(userId: string, list: IPTVList, id: string): Promise<TVSeriesDetail | undefined> {
  const base = (await getCatalog(userId, list)).series.items.find((s) => s.id === id);
  if (!base) return undefined;
  return cached(sha256(`${listKey(userId, list)}:series:${id}`), DETAIL_TTL, () => fetchSeries(list, base));
}
