import { Hono } from "hono";
import { z } from "zod";
import { getCatalog, getGuide } from "./cache.js";
import { fetchShortEpg, nowNext, programmesBetween } from "./epg.js";
import {
  adultItemsVisible,
  isCategoryHidden,
  orderCategories,
  type TVListPrefs,
} from "./prefs.js";
import { fail, findList, NOT_AVAILABLE } from "./route-helpers.js";
import type { IPTVList, TVCatalog } from "./types.js";

import { overlappingGuideDays, validGuideZone } from "./guide-days.js";

export const epgRoutes = new Hono();
const noGuide = (list: IPTVList) => list.type === "m3u" && !list.epgUrl;
const timeWindow = z
  .object({
    from: z.coerce.number().finite().min(0),
    to: z.coerce.number().finite().min(0),
  })
  .refine((q) => q.to > q.from && q.to - q.from <= 86_400_000);
const gridQuery = z
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

function channels(catalog: TVCatalog, prefs: TVListPrefs, category?: string) {
  const cats = orderCategories(catalog.live.categories, prefs).filter(
    (c) => !c.hidden && (!category || category === c.id),
  );
  const allowed = new Set(cats.map((c) => c.id));
  const adult = adultItemsVisible(catalog.live.categories, prefs);
  const rank = new Map(cats.map((c, i) => [c.id, i]));
  return catalog.live.items
    .filter((c) => allowed.has(c.categoryId) && (adult || !c.adult))
    .sort((a, b) => rank.get(a.categoryId)! - rank.get(b.categoryId)!);
}
function categoryAvailable(
  catalog: TVCatalog,
  prefs: TVListPrefs,
  id?: string,
): boolean {
  if (!id) return true;
  const category = catalog.live.categories.find((c) => c.id === id);
  return !!category && !isCategoryHidden(category, prefs);
}

epgRoutes.get("/lists/:listId/epg/now", async (c) => {
  const query = z
    .object({ category: z.string().min(1) })
    .safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Pedido inválido." }, 400);
  const userId = c.get("member").id;
  const found = await findList(userId, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    const catalog = await getCatalog(userId, found.list);
    if (!categoryAvailable(catalog, found.prefs, query.data.category))
      return c.json({ error: NOT_AVAILABLE }, 404);
    const index = await getGuide(userId, found.list);
    const now = Date.now();
    const entries = channels(catalog, found.prefs, query.data.category)
      .map(
        (channel) => [channel.id, nowNext(index, channel.epgId, now)] as const,
      )
      .filter(([, pair]) => pair.now || pair.next);
    return c.json(Object.fromEntries(entries));
  } catch (e) {
    return fail(c, e);
  }
});

epgRoutes.get("/lists/:listId/epg/grid", async (c) => {
  const parsed = gridQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Pedido inválido." }, 400);
  const q = parsed.data;
  const userId = c.get("member").id;
  const found = await findList(userId, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    const catalog = await getCatalog(userId, found.list);
    if (!categoryAvailable(catalog, found.prefs, q.category))
      return c.json({ error: NOT_AVAILABLE }, 404);
    let all = noGuide(found.list)
      ? []
      : channels(catalog, found.prefs, q.category);
    if (q.favorites === "1") {
      const favorites = new Set(found.prefs.favorites.live);
      all = all.filter((channel) => favorites.has(channel.id));
    }
    const page = all.slice(q.page * q.size, q.page * q.size + q.size);
    const index = !noGuide(found.list)
      ? await getGuide(userId, found.list)
      : new Map();
    // Availability is independent of the selected window, and bounded to useful civil dates.
    const availability = {
      from: Date.now() - 2 * 86400000,
      to: Date.now() + 9 * 86400000,
      timezone: q.timezone,
    };
    function* programmes() {
      for (const channel of all)
        yield* index.get(channel.epgId?.toLowerCase() ?? "") ?? [];
    }
    return c.json({
      availability,
      availableDays: overlappingGuideDays(
        programmes(),
        q.timezone,
        availability.from,
        availability.to,
      ),
      channels: page.map(({ id, name, number, logo, epgId, categoryId }) => ({
        id,
        name,
        number,
        logo,
        categoryId,
        programmes: programmesBetween(index, epgId, q.from, q.to),
      })),
      total: all.length,
      page: q.page,
      size: q.size,
    });
  } catch (e) {
    return fail(c, e);
  }
});

epgRoutes.get("/lists/:listId/epg/channel/:id", async (c) => {
  const query = timeWindow.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Pedido inválido." }, 400);
  const userId = c.get("member").id;
  const found = await findList(userId, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    const catalog = await getCatalog(userId, found.list);
    const channel = channels(catalog, found.prefs).find(
      (ch) => ch.id === c.req.param("id"),
    );
    if (!channel) return c.json({ error: NOT_AVAILABLE }, 404);
    const index = await getGuide(userId, found.list);
    const { from, to } = query.data;
    if (channel.epgId && index.has(channel.epgId.toLowerCase()))
      return c.json(programmesBetween(index, channel.epgId, from, to));
    const short = await fetchShortEpg(found.list, channel.id);
    return c.json(short.filter((p) => p.stop > from && p.start < to));
  } catch (e) {
    return fail(c, e);
  }
});
