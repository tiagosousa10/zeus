import { Hono } from "hono";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { user, session, invite } from "../../db/schema.js";
import { requireMember, requireAdmin } from "../auth/middleware.js";
import { hashToken } from "../../lib/crypto.js";
import { emailConfigured, sendTransactionalEmail } from "../email/service.js";
import { config } from "../../lib/config.js";
export const adminRoutes = new Hono();
adminRoutes.use("*", requireMember, requireAdmin);
adminRoutes.get("/members", async (c) =>
  c.json({
    members: await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
      })
      .from(user),
  }),
);
adminRoutes.patch("/members/:id", async (c) => {
  const b = z
    .object({ active: z.boolean() })
    .strict()
    .parse(await c.req.json());
  const id = c.req.param("id");
  const [target] = await db.select().from(user).where(eq(user.id, id));
  if (!target) return c.json({ error: "Membro não encontrado." }, 404);
  if (target.role === "admin")
    return c.json(
      { error: "O Administrador inicial não pode ser desactivado." },
      400,
    );
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ active: b.active, updatedAt: new Date() })
      .where(eq(user.id, id));
    if (!b.active) await tx.delete(session).where(eq(session.userId, id));
  });
  return c.json({ ok: true });
});
adminRoutes.get("/invites", async (c) =>
  c.json({
    invites: await db
      .select({
        id: invite.id,
        email: invite.email,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        usedAt: invite.usedAt,
      })
      .from(invite),
  }),
);
adminRoutes.post("/invites", async (c) => {
  const b = z.object({ email: z.email() }).parse(await c.req.json());
  const token = randomBytes(32).toString("base64url");
  const [created] = await db
    .insert(invite)
    .values({
      id: randomUUID(),
      email: b.email.toLowerCase(),
      tokenHash: hashToken(token),
      createdBy: c.get("member").id,
      expiresAt: new Date(Date.now() + 7 * 86400e3),
    })
    .returning({
      id: invite.id,
      email: invite.email,
      expiresAt: invite.expiresAt,
    });
  const url = `${config.origin}/entrada?invite=${token}`;
  let emailSent = false;
  let deliveryError: string | undefined;
  if (emailConfigured()) {
    try {
      await sendTransactionalEmail({
        to: created.email,
        subject: "O teu Convite para o Zeus",
        text: `Foste convidado para o Zeus.\n\nAceita o Convite para criar a tua conta: ${url}\n\nEsta ligação só pode ser usada uma vez e expira em 7 dias. Vais precisar de configurar uma aplicação autenticadora.\n\nSe não esperavas este Convite, podes ignorar este email.`,
        idempotencyKey: `zeus-invite/${created.id}`,
      });
      emailSent = true;
    } catch (e) {
      deliveryError =
        e instanceof Error ? e.message : "Não foi possível enviar o email.";
    }
  }
  return c.json(
    {
      invite: created,
      url,
      emailSent,
      ...(deliveryError ? { deliveryError } : {}),
    },
    201,
  );
});
adminRoutes.delete("/invites/:id", async (c) => {
  await db
    .delete(invite)
    .where(and(eq(invite.id, c.req.param("id")), isNull(invite.usedAt)));
  return c.json({ ok: true });
});
