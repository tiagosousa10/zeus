import { setTimeout as delay } from "node:timers/promises";
export const emailConfigured = () =>
  !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
/** Retries reuse the same business-event key; accepting a message is not proof of delivery. */
export async function sendTransactionalEmail(
  input: { to: string; subject: string; text: string; idempotencyKey: string },
  request: typeof fetch = fetch,
) {
  if (!emailConfigured())
    throw new Error("O envio de email ainda não está configurado.");
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM,
          to: [input.to],
          subject: input.subject,
          text: input.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      if (attempt === 2) throw new Error("O serviço de email não respondeu.");
      await delay(250 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      const result = (await response.json()) as { id?: string };
      if (!result.id)
        throw new Error("O serviço de email devolveu uma resposta inválida.");
      return result.id;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await delay(250 * 2 ** attempt);
      continue;
    }
    throw new Error(
      "Não foi possível enviar o email. Confirma a configuração do Resend.",
    );
  }
  throw new Error("Não foi possível enviar o email.");
}
