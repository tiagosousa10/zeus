import { z } from "zod";
export const sectionSchema = z.enum(["live", "movie", "series"]);
export const pageQuery = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(200).default(60),
  q: z.string().max(200).optional(),
  tag: z.string().max(40).optional(),
  anchor: z.string().max(200).optional(),
  favorites: z.enum(["0", "1"]).default("0"),
});
export type PageQuery = z.infer<typeof pageQuery>;
