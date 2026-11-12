import { z } from "zod";

export const registration = z.object({
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
  email: z.email().optional(),
  token: z.string().optional(),
  turnstileToken: z.string().optional(),
});
export type RegistrationData = z.infer<typeof registration>;
export type InvitationData = z.infer<typeof registration>;
