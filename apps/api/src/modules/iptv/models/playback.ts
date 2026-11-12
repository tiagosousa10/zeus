import { z } from "zod";
export const playBody = z.discriminatedUnion("section", [
  z.object({ section: z.literal("live"), id: z.string().min(1) }),
  z.object({ section: z.literal("movie"), id: z.string().min(1) }),
  z.object({
    section: z.literal("series"),
    id: z.string().min(1),
    episodeId: z.string().min(1),
  }),
]);

export const seekTime = z.coerce.number().finite().min(0);
export type PlaybackTarget = z.infer<typeof playBody>;
