import { Hono, type Context } from "hono";
import { z } from "zod";
import { safeStream } from "../../lib/safe-fetch.js";
import { upstreamFor, type Upstream } from "./account.js";
import { getAccount, getCatalog, getSeries } from "./cache.js";
import { rewritePlaylist } from "./hls.js";
import { startBridge, remux } from "./remux.js";
import { fail, findList, NOT_AVAILABLE } from "./route-helpers.js";
import {
  addResource,
  createSession,
  endSession,
  findSession,
  type PlaySession,
} from "./sessions.js";
import type { IPTVList } from "./types.js";
import { visibleItem } from "./views.js";

const ENDED = "Esta reprodução terminou.";
const UNREACHABLE = "O fornecedor não respondeu. Tenta de novo.";
const LIMIT_STATUSES = new Set([401, 403, 429, 458, 509]);
const MAX_PLAYLIST = 2 * 1024 * 1024;
const TOUCH_MS = 60_000;
const DIRECT = new Set(["mp4", "m4v", "mov", "webm"]);
const PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
];
const MAX_LEADING_SPACE = 64 * 1024;
const SNIFF_BYTES = 512;

let upstreamFetch = safeStream;
export function setUpstreamFetch(f: typeof safeStream): void {
  upstreamFetch = f;
}

const playBody = z.discriminatedUnion("section", [
  z.object({ section: z.literal("live"), id: z.string().min(1) }),
  z.object({ section: z.literal("movie"), id: z.string().min(1) }),
  z.object({
    section: z.literal("series"),
    id: z.string().min(1),
    episodeId: z.string().min(1),
  }),
]);

function playback(u: Upstream): {
  type: "hls" | "mpegts" | "mp4";
  path: string;
  remux: boolean;
} {
  if (u.kind === "hls")
    return { type: "hls", path: "index.m3u8", remux: false };
  if (u.kind === "ts") return { type: "mpegts", path: "live.ts", remux: false };
  return DIRECT.has(u.container.toLowerCase())
    ? { type: "mp4", path: "file", remux: false }
    : { type: "mp4", path: "remux.mp4", remux: true };
}

export const playRoutes = new Hono();
const starts = new Map<string, symbol>();
playRoutes.post("/play/:token/stop", (c) => {
  const session = findSession(c.req.param("token"), c.get("member").id);
  if (!session) return c.json({ error: NOT_AVAILABLE }, 404);
  if (session !== "ended") endSession(session);
  return c.json({ stopped: true });
});

playRoutes.post("/lists/:listId/play", async (c) => {
  const body = playBody.safeParse(await c.req.json().catch(() => undefined));
  if (!body.success) return c.json({ error: "Pedido inválido." }, 400);
  const target = body.data;
  const userId = c.get("member").id;
  const found = await findList(userId, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  const key = userId + ":" + found.list.id;
  const generation = Symbol();
  starts.set(key, generation);
  try {
    const catalog = await getCatalog(userId, found.list);
    if (!visibleItem(catalog, found.prefs, target.section, target.id))
      return c.json({ error: NOT_AVAILABLE }, 404);
    const account = await getAccount(userId, found.list);
    const detail =
      target.section === "series"
        ? await getSeries(userId, found.list, target.id)
        : undefined;
    const upstream = upstreamFor(found.list, catalog, detail, account, target);
    if (!upstream) return c.json({ error: NOT_AVAILABLE }, 404);
    if (starts.get(key) !== generation || c.req.raw.signal.aborted)
      return c.json({ error: ENDED }, 409);
    const s = createSession(
      userId,
      found.list.id,
      upstream,
      account,
      secretsFor(found.list, upstream),
    );
    const { type, path, remux } = playback(upstream);
    return c.json({
      token: s.token,
      type,
      url: `/api/iptv/play/${s.token}/${path}`,
      remux,
    });
  } catch (e) {
    return fail(c, e);
  } finally {
    if (starts.get(key) === generation) starts.delete(key);
  }
});

const forms = (values: string[]) => [
  ...new Set(
    values
      .flatMap((v) => [v, encodeURIComponent(v)])
      .map((v) => v.toLowerCase()),
  ),
];

// All-digit values would collide with BANDWIDTH or MEDIA-SEQUENCE; the hosts still guard those lists.
const isCredential = (v: string | null | undefined): v is string =>
  !!v && v.length >= 6 && !/^\d+$/.test(v);

function secretsFor(
  list: IPTVList,
  upstream: Upstream,
): PlaySession["secrets"] {
  const query = [...new URL(list.url).searchParams].filter(([k]) =>
    ["username", "password", "token"].includes(k.toLowerCase()),
  );
  return {
    credentials: forms(
      [list.username, list.password, ...query.map(([, v]) => v)].filter(
        isCredential,
      ),
    ),
    hosts: forms([new URL(list.url).hostname, new URL(upstream.url).hostname]),
  };
}

const escapeRegExp = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Our own links hold a random token that could contain a secret by chance, so they are left out. Credentials
// match only as whole tokens, so short or common ones never collide with attributes such as CODECS.
const leaksSecret = (s: PlaySession, text: string): boolean => {
  const rest = text
    .replace(/\/api\/iptv\/play\/[\w-]+\/r\/\d+/g, "")
    .toLowerCase();
  return (
    s.secrets.hosts.some((host) => rest.includes(host)) ||
    s.secrets.credentials.some((c) =>
      new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(c)}(?:[^a-z0-9]|$)`).test(rest),
    )
  );
};

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
async function withSession(
  c: Context,
  run: (s: PlaySession) => Promise<Response>,
  index = false,
): Promise<Response> {
  const s = findSession(c.req.param("token") ?? "", c.get("member").id);
  if (s === "ended") return c.json({ error: ENDED }, 410);
  if (!s) return c.json({ error: NOT_AVAILABLE }, 404);
  try {
    return await run(s);
  } catch (e) {
    if (s.ended) return c.json({ error: ENDED }, 410);
    if (e instanceof UpstreamStatus) {
      const { maxConnections: max, activeConnections: active } = s.account;
      const full =
        index &&
        e.status === 404 &&
        max !== undefined &&
        active !== undefined &&
        active >= max;
      if (LIMIT_STATUSES.has(e.status) || full)
        return c.json({ error: limitMessage(s) }, 502);
    }
    return c.json({ error: UNREACHABLE }, 502);
  }
}

async function open(
  c: Context,
  s: PlaySession,
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  const r = await upstreamFetch(url, {
    headers,
    signal: AbortSignal.any([
      s.signal,
      c.req.raw.signal,
      ...(signal ? [signal] : []),
    ]),
  });
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

async function playlist(
  c: Context,
  s: PlaySession,
  r: Response,
): Promise<Response> {
  for (const host of forms([new URL(r.url).hostname]))
    if (!s.secrets.hosts.includes(host)) s.secrets.hosts.push(host);
  const text = rewritePlaylist(
    await readCapped(r),
    r.url,
    (u, isPlaylist) =>
      `/api/iptv/play/${s.token}/r/${addResource(s, u, isPlaylist)}`,
  );
  if (leaksSecret(s, text)) throw new Error("playlist holds a provider secret");
  return c.body(text, 200, {
    "content-type": "application/vnd.apple.mpegurl",
    "cache-control": "no-store",
  });
}

// A TS sync byte, a control byte or invalid UTF-8 means a binary key or segment, whatever its content-type says.
function looksBinary(head: Uint8Array[]): boolean {
  const bytes = Buffer.concat(head).subarray(0, SNIFF_BYTES);
  if (
    bytes[0] === 0x47 ||
    bytes.some((b) => b < 0x09 || (b >= 0x0e && b <= 0x1f))
  )
    return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
    return false;
  } catch {
    return true;
  }
}

// Reads until "#EXTM3U" could show (BOM and whitespace skipped) to spot a playlist with an odd path or
// content-type, and at least `sniff` bytes; the body stays intact for relaying. Endless leading whitespace
// counts as "not a playlist".
async function peek(
  r: Response,
  sniff: number,
): Promise<{ playlist: boolean; binary: boolean; response: Response }> {
  if (!r.body) return { playlist: false, binary: false, response: r };
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  const head: Uint8Array[] = [];
  let bytes = 0;
  let done = false;
  let start = "";
  while ((start.length < 7 || bytes < sniff) && bytes <= MAX_LEADING_SPACE) {
    const next = await reader.read();
    if (next.done) {
      done = true;
      break;
    }
    head.push(next.value);
    bytes += next.value.byteLength;
    start = (start + decoder.decode(next.value, { stream: true })).trimStart();
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of head) controller.enqueue(chunk);
      if (done) controller.close();
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
  return {
    playlist: start.startsWith("#EXTM3U"),
    binary: looksBinary(head),
    response,
  };
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
  const headers = new Headers({
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
  });
  for (const name of PASS_HEADERS) {
    const value = r.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(r.body?.pipeThrough(touch) ?? null, {
    status: r.status,
    headers,
  });
}

const isPlaylistPath = (url: string) =>
  new URL(url).pathname.toLowerCase().endsWith(".m3u8");

playRoutes.get("/play/:token/index.m3u8", (c) =>
  withSession(
    c,
    async (s) =>
      s.upstream.kind === "hls"
        ? playlist(c, s, await open(c, s, s.upstream.url))
        : c.json({ error: NOT_AVAILABLE }, 404),
    true,
  ),
);

playRoutes.get("/play/:token/r/:id", (c) =>
  withSession(c, async (s) => {
    const url = s.resources.get(c.req.param("id") ?? "");
    if (!url) return c.json({ error: NOT_AVAILABLE }, 404);
    const known = isPlaylistPath(url) || s.playlists.has(url);
    const range = known ? undefined : c.req.header("range");
    let r = await open(c, s, url, range ? { range } : undefined);
    const type = r.headers.get("content-type") ?? "";
    // A partial text body may be the middle of a playlist, past "#EXTM3U", so it can be neither relayed nor rewritten.
    if (
      !known &&
      r.status === 206 &&
      (!type || /^text\/|mpegurl/i.test(type))
    ) {
      await r.body?.cancel().catch(() => {});
      throw new Error("partial playlist");
    }
    if (!known && !/mpegurl/i.test(type)) {
      // Keys and segments are binary (WebVTT subtitles aside); other text may hold upstream locations.
      const textual = /^text\/(?!vtt\b)|^application\/json/i.test(type);
      const peeked = await peek(r, textual ? SNIFF_BYTES : 0);
      if (!peeked.playlist) {
        if (textual && !peeked.binary) {
          await peeked.response.body?.cancel().catch(() => {});
          throw new Error("unexpected text");
        }
        if (textual)
          peeked.response.headers.set(
            "content-type",
            "application/octet-stream",
          );
        return relay(s, peeked.response);
      }
      r = peeked.response;
    }
    // Re-adding keeps a long-lived playlist (live variant) from being evicted by the resource cap.
    addResource(s, url, true);
    return playlist(c, s, r);
  }),
);

playRoutes.get("/play/:token/live.ts", (c) =>
  withSession(c, async (s) => {
    if (s.upstream.kind !== "ts") return c.json({ error: NOT_AVAILABLE }, 404);
    const response = relay(s, await open(c, s, s.upstream.url));
    response.headers.set("content-type", "video/mp2t");
    response.headers.set("cache-control", "no-store");
    return response;
  }),
);

playRoutes.get("/play/:token/file", (c) =>
  withSession(c, async (s) => {
    if (
      s.upstream.kind !== "file" ||
      !DIRECT.has(s.upstream.container.toLowerCase())
    )
      return c.json({ error: NOT_AVAILABLE }, 404);
    const range = c.req.header("range");
    const response = relay(
      s,
      await open(c, s, s.upstream.url, range ? { range } : undefined),
    );
    if (!response.headers.has("content-type")) {
      const container = s.upstream.container.toLowerCase();
      response.headers.set(
        "content-type",
        container === "webm"
          ? "video/webm"
          : container === "mov"
            ? "video/quicktime"
            : "video/mp4",
      );
    }
    response.headers.set("cache-control", "no-store");
    return response;
  }),
);

playRoutes.get("/play/:token/remux.mp4", async (c) => {
  const time = z.coerce
    .number()
    .finite()
    .min(0)
    .safeParse(c.req.query("t") ?? 0);
  if (!time.success) return c.json({ error: "Pedido inválido." }, 400);
  return withSession(c, async (s) => {
    if (
      s.upstream.kind !== "file" ||
      DIRECT.has(s.upstream.container.toLowerCase())
    )
      return c.json({ error: NOT_AVAILABLE }, 404);
    const lifetime = new AbortController();
    const signal = AbortSignal.any([
      s.signal,
      c.req.raw.signal,
      lifetime.signal,
    ]);
    try {
      let upstreamError: unknown;
      const input = await startBridge(
        s,
        async (range, requestSignal) => {
          try {
            return await open(
              c,
              s,
              s.upstream.url,
              range ? { range } : undefined,
              requestSignal,
            );
          } catch (error) {
            upstreamError = error;
            throw error;
          }
        },
        signal,
      );
      const reader = remux(input, time.data, signal).getReader();
      // Wait for real media before committing HTTP headers, so provider refusals retain their message.
      let first: ReadableStreamReadResult<Uint8Array>;
      try {
        first = await reader.read();
      } catch (error) {
        throw upstreamError ?? error;
      }
      if (first.done) throw upstreamError ?? new Error(UNREACHABLE);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(first.value!);
        },
        async pull(controller) {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              lifetime.abort();
              controller.close();
            } else controller.enqueue(chunk.value);
          } catch {
            const cancelled = signal.aborted;
            lifetime.abort();
            if (cancelled) controller.close();
            else controller.error(new Error(UNREACHABLE));
          }
        },
        async cancel(reason) {
          lifetime.abort();
          await reader.cancel(reason);
        },
      });
      const response = relay(
        s,
        new Response(body, { headers: { "content-type": "video/mp4" } }),
      );
      response.headers.set("cache-control", "no-store");
      return response;
    } catch (error) {
      lifetime.abort();
      throw error;
    }
  });
});
