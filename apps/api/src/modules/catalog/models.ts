import { z } from "zod";

export const getMetadataInput = z.object({
  id: z.string().regex(/^tt\d+$/),
  type: z.enum(["movie", "series"]),
});
export type GetMetadataInputData = z.infer<typeof getMetadataInput>;
