import { eq } from "drizzle-orm";
import { verifiedSession } from "../../db/schema.js";
import { createMiddleware } from "hono/factory";
import { auth } from "./service.js";
import { db } from "../../db/client.js";
export const requireMember = createMiddleware(async (c, next) => {
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s || !s.user.active) return c.json({ error: "Sessão necessária." }, 401);
  const verified = await db
    .select()
    .from(verifiedSession)
    .where(eq(verifiedSession.sessionId, s.session.id));
  if (!s.user.twoFactorEnabled || !verified.length)
    return c.json(
      {
        error: "Configura e verifica o autenticador para continuar.",
        code: "TOTP_REQUIRED",
      },
      403,
    );
  c.set("member", s.user);
  await next();
});
export const requireAdmin = createMiddleware(async (c, next) => {
  if (c.get("member")?.role !== "admin")
    return c.json({ error: "Apenas Administradores." }, 403);
  await next();
});
