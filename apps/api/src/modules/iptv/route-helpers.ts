import type { Context } from "hono";
import { getState } from "../member/service.js";
import { ProviderError } from "./provider.js";
import { prefsFor } from "./prefs.js";
import type { IPTVList } from "./types.js";

export const NOT_AVAILABLE = "Este conteúdo não está disponível.";

export async function findList(userId: string, listId: string) {
  const state = await getState(userId);
  const list = (state.iptv as IPTVList[]).find((l) => l.id === listId);
  return list ? { list, prefs: prefsFor(state as { tv?: Record<string, unknown> }, listId) } : undefined;
}

export function fail(c: Context, e: unknown) {
  if (e instanceof ProviderError) return c.json({ error: e.message }, 502);
  throw e;
}
