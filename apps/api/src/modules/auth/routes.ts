import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { user, invite, verifiedSession } from "../../db/schema.js";
import { auth, createAuth } from "./service.js";
import { hashToken } from "../../lib/crypto.js";
import { verifyTurnstile } from "../../lib/turnstile.js";
import { HTTPException } from "hono/http-exception";
export const authRoutes = new Hono();
const registration = z.object({
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
  email: z.email().optional(),
  token: z.string().optional(),
  turnstileToken: z.string().optional(),
});
authRoutes.get("/bootstrap", async (c) =>
  c.json({
    required: !(await db.select({ id: user.id }).from(user).limit(1)).length,
  }),
);
authRoutes.get("/config", (c) =>
  c.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM),
  }),
);
authRoutes.post("/bootstrap", async (c) => {
  const b = registration.parse(await c.req.json());
  if (!b.email) throw new HTTPException(400, { message: "Email obrigatório." });
  await verifyTurnstile(b.turnstileToken);
  return db.transaction(async (tx) => {
    if ((await tx.select().from(user).limit(1)).length)
      throw new HTTPException(409, {
        message: "O Administrador inicial já existe.",
      });
    const response = await createAuth(tx).api.signUpEmail({
      body: { name: b.name, email: b.email!, password: b.password },
      headers: c.req.raw.headers,
      asResponse: true,
    });
    if (!response.ok) return response;
    await tx
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, b.email!.toLowerCase()));
    return response;
  });
});
authRoutes.post("/invites/accept", async (c) => {
  const b = registration.parse(await c.req.json());
  if (!b.token)
    throw new HTTPException(400, { message: "Convite obrigatório." });
  await verifyTurnstile(b.turnstileToken);
  return db.transaction(async (tx) => {
    const [i] = await tx
      .select()
      .from(invite)
      .where(eq(invite.tokenHash, hashToken(b.token!)));
    if (!i || i.usedAt || i.expiresAt < new Date())
      throw new HTTPException(400, {
        message: "Convite inválido ou expirado.",
      });
    const response = await createAuth(tx).api.signUpEmail({
      body: { name: b.name, email: i.email, password: b.password },
      headers: c.req.raw.headers,
      asResponse: true,
    });
    if (response.ok)
      await tx
        .update(invite)
        .set({ usedAt: new Date() })
        .where(eq(invite.id, i.id));
    return response;
  });
});
authRoutes.get("/session", async (c) => {
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s?.user.active) return c.json({ user: null });
  const verified = await db
    .select()
    .from(verifiedSession)
    .where(eq(verifiedSession.sessionId, s.session.id));
  return c.json({
    user: {
      ...s.user,
      twoFactorVerified: !!s.user.twoFactorEnabled && verified.length > 0,
    },
  });
});
authRoutes.all("/auth/*", async (c) => {
  const path = c.req.path.slice("/api/auth".length);
  if (path === "/sign-up/email" || path === "/two-factor/disable")
    return c.json({ error: "Usa um Convite. O TOTP é obrigatório." }, 403);
  const enrollmentPaths = new Set([
    "/sign-in/email",
    "/sign-out",
    "/get-session",
    "/request-password-reset",
    "/reset-password",
    "/two-factor/enable",
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/error",
  ]);
  if (!enrollmentPaths.has(path)) {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!s?.user.active) return c.json({ error: "Sessão necessária." }, 401);
    const verified = await db
      .select()
      .from(verifiedSession)
      .where(eq(verifiedSession.sessionId, s.session.id));
    if (!s.user.twoFactorEnabled || !verified.length)
      return c.json(
        {
          error: "Verifica o autenticador para continuar.",
          code: "TOTP_REQUIRED",
        },
        403,
      );
  }

  if (
    path === "/request-password-reset" &&
    !(process.env.RESEND_API_KEY && process.env.RESEND_FROM)
  )
    return c.json(
      { error: "O envio de email ainda não está configurado." },
      503,
    );
  if (path === "/sign-in/email" || path === "/request-password-reset")
    await verifyTurnstile(c.req.header("x-turnstile-token"));
  let request = c.req.raw;
  if (
    path === "/two-factor/verify-totp" ||
    path === "/two-factor/verify-backup-code"
  ) {
    const body = await request.clone().json();
    body.trustDevice = false;
    request = new Request(request, { body: JSON.stringify(body) });
  }
  const response = await auth.handler(request);
  if (
    response.ok &&
    (path === "/two-factor/verify-totp" ||
      path === "/two-factor/verify-backup-code")
  ) {
    const cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    const headers = new Headers(request.headers);
    if (cookie) headers.set("cookie", cookie);
    const session = await auth.api.getSession({ headers });
    if (session?.user.twoFactorEnabled)
      await db
        .insert(verifiedSession)
        .values({ sessionId: session.session.id })
        .onConflictDoNothing();
  }
  return response;
});
