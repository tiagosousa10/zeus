import { Hono } from "hono";
import { z } from "zod";
import { requireMember } from "../auth/middleware.js";
const engine = process.env.ZEUS_MOTOR_URL || "http://127.0.0.1:11471";
const engineHeaders = () => ({
  "X-Zeus-Motor-Token": process.env.ZEUS_MOTOR_TOKEN || "",
});
let ownerId: string | null = null;
let starting = false;
const grants = new Map<string, Set<string>>();
export const motorRoutes = new Hono();
motorRoutes.use("*", requireMember);
motorRoutes.get("/status", async (c) => {
  try {
    const r = await fetch(engine + "/status", {
      headers: engineHeaders(),
      signal: AbortSignal.timeout(2000),
    });
    const data = (await r.json()) as any;
    const allowed = grants.get(c.get("member").id);
    if (
      data.infoHash &&
      !Array.from(allowed || []).some((k) => k.startsWith(data.infoHash + "/"))
    )
      return c.json({ ok: data.ok, active: false, busy: data.active });
    return c.json(data);
  } catch {
    return c.json({ ok: false, active: false }, 503);
  }
});
motorRoutes.post("/start", async (c) => {
  const body = z
    .object({
      infoHash: z.string().regex(/^[a-f0-9]{40}$/i),
      fileIdx: z.number().int().nonnegative().optional(),
    })
    .parse(await c.req.json());
  if (starting)
    return c.json({ error: "O Motor está a preparar outra Fonte." }, 409);
  if (ownerId && ownerId !== c.get("member").id) {
    try {
      const r = await fetch(engine + "/status", {
        headers: engineHeaders(),
        signal: AbortSignal.timeout(2000),
      });
      const status = (await r.json()) as any;
      if (status.active)
        return c.json(
          { error: "O Motor local está a ser usado por outro Membro." },
          409,
        );
    } catch {}
  }
  starting = true;
  const q = new URLSearchParams({
    magnet: `magnet:?xt=urn:btih:${body.infoHash}`,
  });
  if (body.fileIdx !== undefined) q.set("fileIdx", String(body.fileIdx));
  try {
    const r = await fetch(engine + "/start?" + q, {
      headers: engineHeaders(),
      signal: AbortSignal.any([AbortSignal.timeout(95000), c.req.raw.signal]),
    });
    const result = (await r.json()) as any;
    if (!r.ok || !result.ok)
      return c.json(
        { error: result.error || "O Motor não conseguiu abrir a Fonte." },
        502,
      );
    const key = `${result.infoHash}/${result.fileIdx}`;
    const userId = c.get("member").id;
    ownerId = userId;
    grants.clear();
    const allowed = new Set<string>();
    allowed.add(key);
    grants.set(userId, allowed);
    return c.json({ ...result, url: `/api/motor/stream/${key}` });
  } catch {
    return c.json(
      { error: "O Motor não respondeu. Confirma que está ligado neste Mac." },
      503,
    );
  } finally {
    starting = false;
  }
});
motorRoutes.get("/stream/:hash/:index", async (c) => {
  const key = c.req.param("hash") + "/" + c.req.param("index");
  if (!grants.get(c.get("member").id)?.has(key))
    return c.json({ error: "Fonte não iniciada nesta conta." }, 403);
  try {
    const headers = new Headers(engineHeaders());
    const range = c.req.header("range");
    if (range) headers.set("Range", range);
    const r = await fetch(engine + "/stream/" + key, {
      headers,
      signal: c.req.raw.signal,
    });
    const out = new Headers();
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ]) {
      const v = r.headers.get(name);
      if (v) out.set(name, v);
    }
    return new Response(r.body, { status: r.status, headers: out });
  } catch {
    return c.json({ error: "A reprodução foi interrompida." }, 502);
  }
});

motorRoutes.post("/stop", async (c) => {
  const body = z
    .object({ infoHash: z.string().regex(/^[a-f0-9]{40}$/i) })
    .parse(await c.req.json());
  const id = c.get("member").id;
  if (
    ownerId !== id ||
    !Array.from(grants.get(id) || []).some((k) =>
      k.startsWith(body.infoHash + "/"),
    )
  )
    return c.json({ ok: true });
  try {
    await fetch(engine + "/stop", {
      headers: engineHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    grants.delete(id);
    ownerId = null;
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Não foi possível parar o Motor." }, 502);
  }
});
