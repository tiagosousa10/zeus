import { DomainError } from "../../lib/domain-error.js";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { user, invite, verifiedSession } from "../../db/schema.js";
import { auth, createAuth } from "./service.js";
import { hashToken } from "../../lib/crypto.js";
import { verifyTurnstile } from "../../lib/turnstile.js";

export const bootstrapStatus = async () => ({
  required: !(await db.select({ id: user.id }).from(user).limit(1)).length,
});

export const authConfiguration = () => ({
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
  emailConfigured: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM),
});

export const bootstrapAdministrator = async (
  headers: Headers,
  input: import("./models.js").RegistrationData,
) => {
  const b = input;

  if (!b.email)
    throw new DomainError("invalid", { error: "Email obrigatório." });
  await verifyTurnstile(b.turnstileToken);
  return db.transaction(async (tx) => {
    if ((await tx.select().from(user).limit(1)).length)
      throw new DomainError("conflict", {
        error: "O Administrador inicial já existe.",
      });
    const response = await createAuth(tx).api.signUpEmail({
      body: { name: b.name, email: b.email!, password: b.password },
      headers: headers,
      asResponse: true,
    });
    if (!response.ok) return response;
    await tx
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, b.email!.toLowerCase()));
    return response;
  });
};

export const acceptInvitation = async (
  headers: Headers,
  input: import("./models.js").InvitationData,
) => {
  const b = input;

  if (!b.token)
    throw new DomainError("invalid", { error: "Convite obrigatório." });
  await verifyTurnstile(b.turnstileToken);
  return db.transaction(async (tx) => {
    const [i] = await tx
      .select()
      .from(invite)
      .where(eq(invite.tokenHash, hashToken(b.token!)));
    if (!i || i.usedAt || i.expiresAt < new Date())
      throw new DomainError("invalid", {
        error: "Convite inválido ou expirado.",
      });
    const response = await createAuth(tx).api.signUpEmail({
      body: { name: b.name, email: i.email, password: b.password },
      headers: headers,
      asResponse: true,
    });
    if (response.ok)
      await tx
        .update(invite)
        .set({ usedAt: new Date() })
        .where(eq(invite.id, i.id));
    return response;
  });
};

export const currentSession = async (headers: Headers) => {
  const s = await auth.api.getSession({ headers: headers });
  if (!s?.user.active) return { user: null };
  const verified = await db
    .select()
    .from(verifiedSession)
    .where(eq(verifiedSession.sessionId, s.session.id));
  return {
    user: {
      ...s.user,
      twoFactorVerified: !!s.user.twoFactorEnabled && verified.length > 0,
    },
  };
};

export const handleAuthentication = async (incoming: Request) => {
  const path = new URL(incoming.url).pathname.slice("/api/auth".length);
  if (path === "/sign-up/email" || path === "/two-factor/disable")
    throw new DomainError("forbidden", {
      error: "Usa um Convite. O TOTP é obrigatório.",
    });
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
  // The emailed link reaches this GET callback before redirecting to the reset form.
  // Better Auth still validates its token and callback origin.
  const resetCallback =
    incoming.method === "GET" && /^\/reset-password\/[^/]+$/.test(path);
  if (!enrollmentPaths.has(path) && !resetCallback) {
    const s = await auth.api.getSession({ headers: incoming.headers });
    if (!s?.user.active)
      throw new DomainError("unauthenticated", { error: "Sessão necessária." });
    const verified = await db
      .select()
      .from(verifiedSession)
      .where(eq(verifiedSession.sessionId, s.session.id));
    if (!s.user.twoFactorEnabled || !verified.length)
      throw new DomainError("forbidden", {
        error: "Verifica o autenticador para continuar.",
        code: "TOTP_REQUIRED",
      });
  }

  if (
    path === "/request-password-reset" &&
    !(process.env.RESEND_API_KEY && process.env.RESEND_FROM)
  )
    throw new DomainError("unavailable", {
      error: "O envio de email ainda não está configurado.",
    });
  if (path === "/sign-in/email" || path === "/request-password-reset")
    await verifyTurnstile(
      incoming.headers.get("x-turnstile-token") ?? undefined,
    );
  let request = incoming;
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
};
