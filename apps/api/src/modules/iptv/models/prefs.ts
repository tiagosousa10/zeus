import { z } from "zod";
export {
  defaultPrefs,
  prefsFor,
  isCategoryHidden,
  adultItemsVisible,
  orderCategories,
} from "../../../../../../packages/contracts/tv-preferences.js";
export type { TVListPrefs } from "../../../../../../packages/contracts/tv-preferences.js";

const ids = z.array(z.string()).max(10000);
const perSection = (list: z.ZodType<string[]>) =>
  z.object({ live: list, movie: list, series: list }).strict();

export const tvListPrefs = z
  .object({
    pinned: perSection(ids.max(4)),
    order: perSection(ids),
    hidden: perSection(ids),
    shownAdult: perSection(ids),
    favorites: perSection(ids),
    progress: z
      .record(
        z.string(),
        z
          .object({
            position: z.number(),
            duration: z.number(),
            updatedAt: z.number(),
          })
          .strict(),
      )
      .refine((r) => Object.keys(r).length <= 5000),
    lastChannel: z.string().optional(),
  })
  .strict();

export const tvPrefs = z
  .record(z.string(), tvListPrefs)
  .refine((r) => Object.keys(r).length <= 100);
