import { HTTPException } from "hono/http-exception";
export async function verifyTurnstile(token?: string) {
  if (!process.env.TURNSTILE_SECRET_KEY) return;
  if (!token)
    throw new HTTPException(400, {
      message: "Completa a verificação Turnstile.",
    });
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const body = (await res.json()) as { success: boolean };
  if (!body.success)
    throw new HTTPException(400, {
      message: "Verificação Turnstile inválida.",
    });
}
