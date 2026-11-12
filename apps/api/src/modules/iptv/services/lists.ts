import { getState } from "../../member/service.js";
import { prefsFor } from "../models/prefs.js";
import type { IPTVList } from "../../../../../../packages/contracts/iptv.js";
export async function findList(userId: string, listId: string) {
  const state = await getState(userId);
  const list = (state.iptv as IPTVList[]).find((list) => list.id === listId);
  return list
    ? {
        list,
        prefs: prefsFor(state as { tv?: Record<string, unknown> }, listId),
      }
    : undefined;
}
