import { z } from "zod";

export const updateAddonInput = z.object({
  status: z.enum(["approved", "rejected"]),
});
export type UpdateAddonInputData = z.infer<typeof updateAddonInput>;
export const listStreamsInput = z.object({
  type: z.enum(["movie", "series"]),
  id: z
    .string()
    .min(1)
    .max(180)
    .regex(/^[a-zA-Z0-9:_-]+$/),
});
export type ListStreamsInputData = z.infer<typeof listStreamsInput>;
export const listSubtitlesInput = z.object({
  type: z.enum(["movie", "series"]),
  id: z
    .string()
    .min(1)
    .max(180)
    .regex(/^[a-zA-Z0-9:_-]+$/),
});
export type ListSubtitlesInputData = z.infer<typeof listSubtitlesInput>;
export const subtitleFileInput = z.object({
  url: z.url().regex(/^https?:\/\//),
  sig: z.string().max(100),
});
export type SubtitleFileInputData = z.infer<typeof subtitleFileInput>;
