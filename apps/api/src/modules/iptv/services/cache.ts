import { createHash } from "node:crypto";
import { DiskCache } from "./disk-cache.js";
import { BoundedCache, estimateSize } from "../../../lib/bounded-cache.js";
import { join } from "node:path";
import { config } from "../../../lib/config.js";
import { decrypt, encrypt } from "../../../lib/crypto.js";
import { fetchGuide, type GuideIndex } from "./epg.js";
import type { Account } from "./account.js";
import {
  fetchAccount,
  fetchCatalog,
  fetchMovie,
  fetchSeries,
} from "./provider.js";
import type {
  IPTVList,
  TVCatalog,
  TVMovieDetail,
  TVSeriesDetail,
} from "../../../../../../packages/contracts/iptv.js";

const CATALOG_TTL = 6 * 3600_000;
const ACCOUNT_TTL = 3600_000;
const DETAIL_TTL = 12 * 3600_000;
// Bump when the cached shape changes so old disk files stop matching.
const CACHE_VERSION = 2;
const dir = join(config.dataDir, "iptv-cache");

type Entry = { value: unknown; expires: number };
type MemoryEntry = Entry & { userId: string; listId: string };
const memory = new BoundedCache<MemoryEntry>(128, 64 * 1024 * 1024);
const inFlight = new Map<string, Promise<unknown>>();
const activeLoads = new Set<{
  userId: string;
  listId: string;
  cancelled: boolean;
}>();
let clock = () => Date.now();
const diskCache = new DiskCache(
  dir,
  {
    totalBytes: 512 * 1024 * 1024,
    memberBytes: 128 * 1024 * 1024,
    totalFiles: 2048,
    memberFiles: 512,
  },
  () => clock(),
);
setInterval(() => {
  memory.prune(clock());
  void diskCache.prune().catch(() => {});
}, 60_000).unref();

export async function removeListCache(
  userId: string,
  listId: string,
): Promise<void> {
  for (const load of activeLoads)
    if (load.userId === userId && load.listId === listId) load.cancelled = true;
  memory.deleteWhere(
    (entry) => entry.userId === userId && entry.listId === listId,
  );
  await diskCache.removeList(userId, listId).catch(() => {});
}

function remember(key: string, entry: Entry, userId: string, listId: string) {
  const owned = { ...entry, userId, listId };
  memory.set(key, owned, entry.expires, estimateSize(owned));
}

async function listOperation<T>(
  userId: string,
  listId: string,
  run: (activity: { cancelled: boolean }) => Promise<T>,
): Promise<T> {
  const activity = { userId, listId, cancelled: false };
  activeLoads.add(activity);
  try {
    return await run(activity);
  } finally {
    activeLoads.delete(activity);
  }
}

export function setClock(f: () => number): void {
  clock = f;
}
export function clearMemoryCache(): void {
  memory.clear();
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const listKey = (userId: string, list: IPTVList) =>
  sha256(
    [
      CACHE_VERSION,
      userId,
      list.id,
      list.type,
      list.url,
      list.username ?? "",
      list.password ?? "",
    ].join("|"),
  );

async function cached<T>(
  userId: string,
  listId: string,
  key: string,
  ttl: number,
  load: (now: number) => Promise<T>,
  force = false,
  disk = true,
): Promise<T> {
  if (!force) {
    const hit = memory.get(key, clock());
    if (hit) return hit.value as T;
  }
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const activity = { userId, listId, cancelled: false };
  activeLoads.add(activity);
  // Coalesce disk reads as well as provider requests.
  const promise = (async () => {
    if (!force && disk) {
      let hit: Entry | undefined;
      try {
        const ciphertext = await diskCache.read(userId, listId, key);
        if (ciphertext) hit = decrypt(ciphertext) as Entry;
      } catch {
        /* Cache failure must not prevent provider playback. */
      }
      if (hit && hit.expires > clock()) {
        if (!activity.cancelled) remember(key, hit, userId, listId);
        return hit.value as T;
      }
    }
    const now = clock();
    const value = await load(now);
    const entry = { value, expires: now + ttl };
    if (!activity.cancelled) {
      remember(key, entry, userId, listId);
      if (disk)
        await diskCache
          .write(userId, listId, key, encrypt(entry), entry.expires)
          .catch(() => {});
    }
    return value;
  })().finally(() => {
    inFlight.delete(key);
    activeLoads.delete(activity);
  });
  inFlight.set(key, promise);
  return promise;
}

export function getCatalog(
  userId: string,
  list: IPTVList,
  opts: { force?: boolean } = {},
): Promise<TVCatalog> {
  return cached(
    userId,
    list.id,
    listKey(userId, list),
    CATALOG_TTL,
    (now) => fetchCatalog(list, now),
    opts.force,
  );
}

export async function getMovie(
  userId: string,
  list: IPTVList,
  id: string,
): Promise<TVMovieDetail | undefined> {
  return listOperation(userId, list.id, async (activity) => {
    const base = (await getCatalog(userId, list)).movie.items.find(
      (m) => m.id === id,
    );
    if (!base || activity.cancelled) return undefined;
    return cached(
      userId,
      list.id,
      sha256(`${listKey(userId, list)}:movie:${id}`),
      DETAIL_TTL,
      () => fetchMovie(list, base),
    );
  });
}

export async function getSeries(
  userId: string,
  list: IPTVList,
  id: string,
): Promise<TVSeriesDetail | undefined> {
  return listOperation(userId, list.id, async (activity) => {
    const base = (await getCatalog(userId, list)).series.items.find(
      (s) => s.id === id,
    );
    if (!base || activity.cancelled) return undefined;
    return cached(
      userId,
      list.id,
      sha256(`${listKey(userId, list)}:series:${id}`),
      DETAIL_TTL,
      () => fetchSeries(list, base),
    );
  });
}

export function getAccount(userId: string, list: IPTVList): Promise<Account> {
  return cached(
    userId,
    list.id,
    sha256(`${listKey(userId, list)}:account`),
    ACCOUNT_TTL,
    () => fetchAccount(list),
    false,
    false,
  );
}

export function getGuide(userId: string, list: IPTVList): Promise<GuideIndex> {
  return cached(
    userId,
    list.id,
    sha256(JSON.stringify([listKey(userId, list), "guide", list.epgUrl ?? ""])),
    3600_000,
    (now) => fetchGuide(list, now),
    false,
    false,
  );
}
