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
export type PublicIPTVList = {
  id: string;
  name: string;
  type: "m3u" | "xtream";
  configured: {
    url: boolean;
    username: boolean;
    password: boolean;
    epgUrl: boolean;
  };
};
export type IPTVListUpdate = z.infer<typeof listUpdate>;
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
