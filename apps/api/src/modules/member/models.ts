import { tvPrefs } from "../iptv/models/prefs.js";
import type { PublicIPTVList } from "../../../../../packages/contracts/member.js";
export type {
  PublicIPTVList,
  IPTVListUpdate,
} from "../../../../../packages/contracts/member.js";
import { z } from "zod";
const httpUrl = z.url().refine((s) => /^https?:\/\//i.test(s));
export const listUpdate = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(100),
    type: z.enum(["m3u", "xtream"]),
    url: httpUrl.optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    epgUrl: z.union([httpUrl, z.literal("")]).optional(),
    configured: z
      .object({
        url: z.boolean(),
        username: z.boolean(),
        password: z.boolean(),
        epgUrl: z.boolean(),
      })
      .optional(),
  })
  .strict();
const storedList = listUpdate
  .omit({ configured: true })
  .extend({ url: httpUrl })
  .superRefine((list, ctx) => {
    if (list.type === "xtream" && (!list.username?.trim() || !list.password))
      ctx.addIssue({
        code: "custom",
        message: "Indica as credenciais da lista.",
      });
  });
export function mergeLists(previous: unknown, updates: unknown) {
  const old = z.array(z.record(z.string(), z.unknown())).parse(previous);
  const entries = z.array(listUpdate).max(100).parse(updates);
  if (new Set(entries.map((l) => l.id)).size !== entries.length)
    throw new z.ZodError([
      { code: "custom", path: ["iptv"], message: "Lista repetida." },
    ]);
  return entries.map(({ configured: _, ...entry }) =>
    storedList.parse({ ...old.find((l) => l.id === entry.id), ...entry }),
  );
}
export function publicState<T extends { iptv: unknown }>(state: T) {
  const lists = state.iptv as Record<string, unknown>[];
  return {
    ...state,
    iptv: lists.map((list): PublicIPTVList => ({
      id: String(list.id),
      name: String(list.name),
      type: list.type as PublicIPTVList["type"],
      configured: {
        url: !!list.url,
        username: !!list.username,
        password: !!list.password,
        epgUrl: !!list.epgUrl,
      },
    })),
  };
}

export const json = z.record(z.string(), z.unknown());
export type MemberPatchData = z.infer<typeof patch>;
export const patch = z
  .object({
    preferences: json.optional(),
    library: z.array(json).max(10000).optional(),
    progress: json.optional(),
    tv: tvPrefs.optional(),
    iptv: z.array(listUpdate).max(100).optional(),
    addons: z
      .array(
        z
          .object({
            id: z.string(),
            enabled: z.boolean().optional(),
            config: json.optional(),
            manifestUrl: z.url().max(4000).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    onboardingDone: z.boolean().optional(),
  })
  .strict();
