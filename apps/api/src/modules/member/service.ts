import { eq } from "drizzle-orm";
import { memberState } from "../../db/schema.js";
import { db } from "../../db/client.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { removeListCache } from "../iptv/services/cache.js";
import { mergeLists } from "./models.js";
export const emptyState = () => ({
  preferences: {},
  library: [],
  progress: {},
  iptv: [],
  tv: {},
  addons: [],
  onboardingDone: false,
});
export async function getState(userId: string) {
  const [row] = await db
    .select()
    .from(memberState)
    .where(eq(memberState.userId, userId));
  return row ? { ...emptyState(), ...decrypt(row.ciphertext) } : emptyState();
}
export async function patchState(
  userId: string,
  patch: Record<string, unknown>,
  publicListUpdates = false,
) {
  const invalidated: string[] = [];
  const state = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(memberState)
      .where(eq(memberState.userId, userId));
    const previous = row ? decrypt(row.ciphertext) : emptyState();
    const state = {
      ...emptyState(),
      ...previous,
      ...patch,
    };
    if (publicListUpdates && patch.iptv !== undefined)
      state.iptv = mergeLists(previous.iptv ?? [], patch.iptv);
    if (patch.iptv !== undefined) {
      for (const old of previous.iptv ?? []) {
        const current = state.iptv.find(
          (list: { id: string }) => list.id === old.id,
        );
        if (!current || JSON.stringify(current) !== JSON.stringify(old))
          invalidated.push(old.id);
      }
    }
    const ciphertext = encrypt(state);
    await tx
      .insert(memberState)
      .values({ userId, ciphertext })
      .onConflictDoUpdate({
        target: memberState.userId,
        set: { ciphertext, updatedAt: new Date() },
      });
    return state;
  });
  for (const listId of invalidated) await removeListCache(userId, listId);
  return state;
}
