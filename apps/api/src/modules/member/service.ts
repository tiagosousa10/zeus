import { sql } from "../../db/client.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
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
  const [row] =
    await sql`select ciphertext from member_state where user_id=${userId}`;
  return row ? { ...emptyState(), ...decrypt(row.ciphertext) } : emptyState();
}
export async function patchState(
  userId: string,
  patch: Record<string, unknown>,
) {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${userId}))`;
    const [row] =
      await tx`select ciphertext from member_state where user_id=${userId}`;
    const state = {
      ...emptyState(),
      ...(row ? decrypt(row.ciphertext) : {}),
      ...patch,
    };
    await tx`insert into member_state(user_id,ciphertext) values(${userId},${encrypt(state)}) on conflict(user_id) do update set ciphertext=excluded.ciphertext,updated_at=now()`;
    return state;
  });
}
