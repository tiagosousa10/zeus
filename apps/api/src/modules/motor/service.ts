import { DomainError } from "../../lib/domain-error.js";
const engine = process.env.ZEUS_MOTOR_URL || "http://127.0.0.1:11471";
const engineHeaders = () => ({
  "X-Zeus-Motor-Token": process.env.ZEUS_MOTOR_TOKEN || "",
});
let ownerId: string | null = null;
let starting = false;
const grants = new Map<string, Set<string>>();

export const motorStatus = async (memberId: string) => {
  try {
    const r = await fetch(engine + "/status", {
      headers: engineHeaders(),
      signal: AbortSignal.timeout(2000),
    });
    const data = (await r.json()) as any;
    const allowed = grants.get(memberId);
    if (
      data.infoHash &&
      !Array.from(allowed || []).some((k) => k.startsWith(data.infoHash + "/"))
    )
      return { ok: data.ok, active: false, busy: data.active };
    return data;
  } catch {
    throw new DomainError("unavailable", { ok: false, active: false });
  }
};

export const startMotor = async (
  memberId: string,
  signal: AbortSignal,
  input: import("./models.js").StartMotorInputData,
) => {
  const body = input;

  if (starting)
    throw new DomainError("conflict", {
      error: "O Motor está a preparar outra Fonte.",
    });
  if (ownerId && ownerId !== memberId) {
    try {
      const r = await fetch(engine + "/status", {
        headers: engineHeaders(),
        signal: AbortSignal.timeout(2000),
      });
      const status = (await r.json()) as any;
      if (status.active)
        throw new DomainError("conflict", {
          error: "O Motor local está a ser usado por outro Membro.",
        });
    } catch (error) {
      if (error instanceof DomainError) throw error;
    }
  }
  starting = true;
  const q = new URLSearchParams({
    magnet: `magnet:?xt=urn:btih:${body.infoHash}`,
  });
  if (body.fileIdx !== undefined) q.set("fileIdx", String(body.fileIdx));
  try {
    const r = await fetch(engine + "/start?" + q, {
      headers: engineHeaders(),
      signal: AbortSignal.any([AbortSignal.timeout(95000), signal]),
    });
    const result = (await r.json()) as any;
    if (!r.ok || !result.ok)
      throw new DomainError("upstream", {
        error: result.error || "O Motor não conseguiu abrir a Fonte.",
      });
    const key = `${result.infoHash}/${result.fileIdx}`;
    const userId = memberId;
    ownerId = userId;
    grants.clear();
    const allowed = new Set<string>();
    allowed.add(key);
    grants.set(userId, allowed);
    return { ...result, url: `/api/motor/stream/${key}` };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("unavailable", {
      error: "O Motor não respondeu. Confirma que está ligado neste Mac.",
    });
  } finally {
    starting = false;
  }
};

export const streamMotor = async (
  memberId: string,
  key: string,
  incoming: Request,
) => {
  if (!grants.get(memberId)?.has(key))
    throw new DomainError("forbidden", {
      error: "Fonte não iniciada nesta conta.",
    });
  try {
    const headers = new Headers(engineHeaders());
    const range = incoming.headers.get("range");
    if (range) headers.set("Range", range);
    const r = await fetch(engine + "/stream/" + key, {
      headers,
      signal: incoming.signal,
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
    throw new DomainError("upstream", {
      error: "A reprodução foi interrompida.",
    });
  }
};

export const stopMotor = async (
  memberId: string,
  input: import("./models.js").StopMotorInputData,
) => {
  const body = input;

  const id = memberId;
  if (
    ownerId !== id ||
    !Array.from(grants.get(id) || []).some((k) =>
      k.startsWith(body.infoHash + "/"),
    )
  )
    return { ok: true };
  try {
    await fetch(engine + "/stop", {
      headers: engineHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    grants.delete(id);
    ownerId = null;
    return { ok: true };
  } catch {
    throw new DomainError("upstream", {
      error: "Não foi possível parar o Motor.",
    });
  }
};
