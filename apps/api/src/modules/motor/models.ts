import { z } from "zod";

export const startMotorInput = z.object({
  infoHash: z.string().regex(/^[a-f0-9]{40}$/i),
  fileIdx: z.number().int().nonnegative().optional(),
});
export type StartMotorInputData = z.infer<typeof startMotorInput>;
export const stopMotorInput = z.object({
  infoHash: z.string().regex(/^[a-f0-9]{40}$/i),
});
export type StopMotorInputData = z.infer<typeof stopMotorInput>;
