import { z } from "zod";

export const updateMemberInput = z.object({ active: z.boolean() }).strict();
export type UpdateMemberInputData = z.infer<typeof updateMemberInput>;
export const createInviteInput = z.object({ email: z.email() });
export type CreateInviteInputData = z.infer<typeof createInviteInput>;
