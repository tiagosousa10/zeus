import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { DomainError } from "../lib/domain-error.js";
import { ProviderError } from "../modules/iptv/services/provider.js";

export const handleError: ErrorHandler = (e, c) => {
  if (e instanceof ProviderError) return c.json({ error: e.message }, 502);
  if (e instanceof DomainError) {
    const statuses = {
      invalid: 400,
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      busy: 429,
      upstream: 502,
      unavailable: 503,
      gone: 410,
    } as const;
    return c.json(e.payload, statuses[e.kind]);
  }
  if (e instanceof ZodError)
    return c.json(
      {
        error: "Dados inválidos.",
        details: e.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      400,
    );
  if (e instanceof HTTPException) return c.json({ error: e.message }, e.status);
  console.error(e.name, e.message);
  return c.json({ error: "Não foi possível concluir o pedido." }, 500);
};
