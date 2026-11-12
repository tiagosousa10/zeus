import { z } from "zod";
import { validGuideZone } from "../../../../../../packages/contracts/guide-days.js";
export const timeWindow = z
  .object({
    from: z.coerce.number().finite().min(0),
    to: z.coerce.number().finite().min(0),
  })
  .refine((q) => q.to > q.from && q.to - q.from <= 86_400_000);
export const gridQuery = z
  .object({
    from: z.coerce.number().finite().min(0),
    to: z.coerce.number().finite().min(0),
    timezone: z.string().max(80).default("UTC").refine(validGuideZone),
    category: z.string().min(1).optional(),
    favorites: z.enum(["0", "1"]).default("0"),
    page: z.coerce.number().int().min(0).default(0),
    size: z.coerce.number().int().min(1).max(200).default(40),
  })
  .refine((q) => q.to > q.from && q.to - q.from <= 86_400_000);
export const nowQuery = z.object({ category: z.string().min(1) });
export type NowQuery = z.infer<typeof nowQuery>;
export type GridQuery = z.infer<typeof gridQuery>;
export type TimeWindow = z.infer<typeof timeWindow>;
