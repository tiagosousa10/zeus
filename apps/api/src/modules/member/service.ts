import { eq } from "drizzle-orm";
import { memberState } from "../../db/schema.js";
import { db } from "../../db/client.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { mergeLists } from "./public-state.js";
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
  return db.transaction(async (tx) => {
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
}
