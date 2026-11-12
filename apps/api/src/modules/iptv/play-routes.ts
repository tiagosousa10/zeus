import { Hono, type Context } from "hono";
import { z } from "zod";
import { safeStream } from "../../lib/safe-fetch.js";
import { upstreamFor, type Upstream } from "./account.js";
import { getAccount, getCatalog, getSeries } from "./cache.js";
import { rewritePlaylist } from "./hls.js";
import { fail, findList, NOT_AVAILABLE } from "./route-helpers.js";
import { addResource, createSession, findSession, type PlaySession } from "./sessions.js";
import { visibleItem } from "./views.js";

const ENDED = "Esta reprodução terminou.";
const UNREACHABLE = "O fornecedor não respondeu. Tenta de novo.";
const LIMIT_STATUSES = new Set([401, 403, 429, 458, 509]);
const MAX_PLAYLIST = 2 * 1024 * 1024;
const TOUCH_MS = 60_000;
const DIRECT = new Set(["mp4", "m4v", "mov", "webm"]);
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];

let upstreamFetch = safeStream;
export function setUpstreamFetch(f: typeof safeStream): void {
  upstreamFetch = f;
}

const playBody = z.discriminatedUnion("section", [
  z.object({ section: z.literal("live"), id: z.string().min(1) }),
  z.object({ section: z.literal("movie"), id: z.string().min(1) }),
  z.object({ section: z.literal("series"), id: z.string().min(1), episodeId: z.string().min(1) }),
]);

function playback(u: Upstream): { type: "hls" | "mpegts" | "mp4"; path: string; remux: boolean } {
  if (u.kind === "hls") return { type: "hls", path: "index.m3u8", remux: false };
  if (u.kind === "ts") return { type: "mpegts", path: "live.ts", remux: false };
  return DIRECT.has(u.container.toLowerCase())
    ? { type: "mp4", path: "file", remux: false }
    : { type: "mp4", path: "remux.mp4", remux: true };
}

export const playRoutes = new Hono();

playRoutes.post("/lists/:listId/play", async (c) => {
  const body = playBody.safeParse(await c.req.json().catch(() => undefined));
  if (!body.success) return c.json({ error: "Pedido inválido." }, 400);
  const target = body.data;
  const userId = c.get("member").id;
  const found = await findList(userId, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    const catalog = await getCatalog(userId, found.list);
    if (!visibleItem(catalog, found.prefs, target.section, target.id)) return c.json({ error: NOT_AVAILABLE }, 404);
    const account = await getAccount(userId, found.list);
    const detail = target.section === "series" ? await getSeries(userId, found.list, target.id) : undefined;
    const upstream = upstreamFor(found.list, catalog, detail, account, target);
    if (!upstream) return c.json({ error: NOT_AVAILABLE }, 404);
    const s = createSession(userId, found.list.id, upstream, account);
    const { type, path, remux } = playback(upstream);
    return c.json({ token: s.token, type, url: `/api/iptv/play/${s.token}/${path}`, remux });
  } catch (e) {
    return fail(c, e);
  }
});

class UpstreamStatus extends Error {
  constructor(readonly status: number) {
    super("upstream status");
  }
}

function limitMessage(s: PlaySession): string {
  const n = s.account.maxConnections;
  return n === undefined
    ? "A lista já está a ser usada noutro aparelho."
    : `A lista já está a ser usada noutro aparelho (máximo de ${n} ligação(ões)).`;
}

// Upstream errors may carry provider URLs or credentials, so only fixed messages leave.
async function withSession(c: Context, run: (s: PlaySession) => Promise<Response>, index = false): Promise<Response> {
  const s = findSession(c.req.param("token") ?? "", c.get("member").id);
  if (s === "ended") return c.json({ error: ENDED }, 410);
  if (!s) return c.json({ error: NOT_AVAILABLE }, 404);
  try {
    return await run(s);
  } catch (e) {
    if (s.ended) return c.json({ error: ENDED }, 410);
    if (e instanceof UpstreamStatus) {
      const { maxConnections: max, activeConnections: active } = s.account;
      const full = index && e.status === 404 && max !== undefined && active !== undefined && active >= max;
      if (LIMIT_STATUSES.has(e.status) || full) return c.json({ error: limitMessage(s) }, 502);
    }
    return c.json({ error: UNREACHABLE }, 502);
  }
}

async function open(c: Context, s: PlaySession, url: string, headers?: Record<string, string>): Promise<Response> {
  const r = await upstreamFetch(url, { headers, signal: AbortSignal.any([s.signal, c.req.raw.signal]) });
  if (!r.ok) {
    await r.body?.cancel().catch(() => {});
    throw new UpstreamStatus(r.status);
  }
  return r;
}

async function readCapped(r: Response): Promise<string> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = r.body?.getReader();
  for (;;) {
    const chunk = await reader?.read();
    if (!chunk || chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_PLAYLIST) {
      await reader!.cancel().catch(() => {});
      throw new Error("playlist too large");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// URLs the rewriter saw as playlists (variants, renditions), so they are never relayed raw.
const playlistUrls = new WeakMap<PlaySession, Set<string>>();
const playlistsOf = (s: PlaySession) => playlistUrls.get(s) ?? playlistUrls.set(s, new Set()).get(s)!;

async function playlist(c: Context, s: PlaySession, r: Response): Promise<Response> {
  const text = rewritePlaylist(await readCapped(r), r.url, (u, isPlaylist) => {
    if (isPlaylist) playlistsOf(s).add(u);
    return `/api/iptv/play/${s.token}/r/${addResource(s, u)}`;
  });
  return c.body(text, 200, { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" });
}

// Reads the first chunk to spot a playlist served with an odd path or content-type; the body stays intact.
async function peek(r: Response): Promise<{ playlist: boolean; response: Response }> {
  if (!r.body) return { playlist: false, response: r };
  const reader = r.body.getReader();
  const first = await reader.read();
  const head = first.done ? new Uint8Array() : first.value;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.byteLength) controller.enqueue(head);
      if (first.done) controller.close();
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  const response = new Response(body, { status: r.status, headers: r.headers });
  Object.defineProperty(response, "url", { value: r.url });
  return { playlist: Buffer.from(head).toString("utf8").trimStart().startsWith("#EXTM3U"), response };
}

// Keeps the session alive while a long body is still flowing to the browser.
function relay(s: PlaySession, r: Response): Response {
  let last = Date.now();
  const touch = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (Date.now() - last >= TOUCH_MS) {
        last = Date.now();
        findSession(s.token, s.userId);
      }
      controller.enqueue(chunk);
    },
  });
  const headers = new Headers({ "x-content-type-options": "nosniff", "content-security-policy": "sandbox" });
  for (const name of PASS_HEADERS) {
    const value = r.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(r.body?.pipeThrough(touch) ?? null, { status: r.status, headers });
}

const isPlaylistPath = (url: string) => new URL(url).pathname.toLowerCase().endsWith(".m3u8");

playRoutes.get("/play/:token/index.m3u8", (c) =>
  withSession(
    c,
    async (s) => (s.upstream.kind === "hls" ? playlist(c, s, await open(c, s, s.upstream.url)) : c.json({ error: NOT_AVAILABLE }, 404)),
    true,
  ),
);

playRoutes.get("/play/:token/r/:id", (c) =>
  withSession(c, async (s) => {
    const url = s.resources.get(c.req.param("id") ?? "");
    if (!url) return c.json({ error: NOT_AVAILABLE }, 404);
    const known = isPlaylistPath(url) || playlistsOf(s).has(url);
    const range = known ? undefined : c.req.header("range");
    let r = await open(c, s, url, range ? { range } : undefined);
    if (!known && !/mpegurl/i.test(r.headers.get("content-type") ?? "")) {
      const peeked = await peek(r);
      if (!peeked.playlist) return relay(s, peeked.response);
      r = peeked.response;
    }
    playlistsOf(s).add(url);
    // Re-adding keeps a long-lived playlist (live variant) from being evicted by the resource cap.
    addResource(s, url);
    return playlist(c, s, r);
  }),
);
