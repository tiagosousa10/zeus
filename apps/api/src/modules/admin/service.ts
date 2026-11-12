import { DomainError } from "../../lib/domain-error.js";
import { randomBytes, randomUUID } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { user, session, invite } from "../../db/schema.js";
import { hashToken } from "../../lib/crypto.js";
import { emailConfigured, sendTransactionalEmail } from "../email/service.js";
import { config } from "../../lib/config.js";

export const listMembers = async () => ({
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
});

export const updateMember = async (
  id: string,
  input: import("./models.js").UpdateMemberInputData,
) => {
  const b = input;

  const [target] = await db.select().from(user).where(eq(user.id, id));
  if (!target)
    throw new DomainError("not_found", { error: "Membro não encontrado." });
  if (target.role === "admin")
    throw new DomainError("invalid", {
      error: "O Administrador inicial não pode ser desactivado.",
    });
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ active: b.active, updatedAt: new Date() })
      .where(eq(user.id, id));
    if (!b.active) await tx.delete(session).where(eq(session.userId, id));
  });
  return { ok: true };
};

export const listInvites = async () => ({
  invites: await db
    .select({
      id: invite.id,
      email: invite.email,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      usedAt: invite.usedAt,
    })
    .from(invite),
});

export const createInvite = async (
  memberId: string,
  input: import("./models.js").CreateInviteInputData,
) => {
  const b = input;

  const token = randomBytes(32).toString("base64url");
  const [created] = await db
    .insert(invite)
    .values({
      id: randomUUID(),
      email: b.email.toLowerCase(),
      tokenHash: hashToken(token),
      createdBy: memberId,
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
  return {
    invite: created,
    url,
    emailSent,
    ...(deliveryError ? { deliveryError } : {}),
  };
};

export const deleteInvite = async (id: string) => {
  await db.delete(invite).where(and(eq(invite.id, id), isNull(invite.usedAt)));
  return { ok: true };
};
