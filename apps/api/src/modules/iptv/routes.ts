import { Hono } from "hono";
import { z } from "zod";
import { requireMember } from "../auth/middleware.js";
import { getCatalog, getMovie, getSeries } from "./cache.js";
import { epgRoutes } from "./epg-routes.js";
import { playRoutes } from "./play-routes.js";
import { fail, findList, NOT_AVAILABLE } from "./route-helpers.js";
import {
  categoryPage,
  publicItem,
  publicSeriesDetail,
  searchIndex,
  sectionsView,
  visibleItem,
} from "./views.js";
import type { TVSeriesDetail } from "./types.js";
export const iptvRoutes = new Hono();
iptvRoutes.use("*", requireMember);
iptvRoutes.route("/", playRoutes);
iptvRoutes.route("/", epgRoutes);
const sectionSchema = z.enum(["live", "movie", "series"]);
const pageQuery = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(200).default(60),
  q: z.string().max(200).optional(),
  tag: z.string().max(40).optional(),
  anchor: z.string().max(200).optional(),
  favorites: z.enum(["0", "1"]).default("0"),
});
iptvRoutes.get("/lists/:listId", async (c) => {
  const found = await findList(c.get("member").id, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    return c.json(
      sectionsView(
        await getCatalog(c.get("member").id, found.list),
        found.prefs,
      ),
    );
  } catch (e) {
    return fail(c, e);
  }
});

iptvRoutes.post("/lists/:listId/refresh", async (c) => {
  const found = await findList(c.get("member").id, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    return c.json(
      sectionsView(
        await getCatalog(c.get("member").id, found.list, { force: true }),
        found.prefs,
      ),
    );
  } catch (e) {
    return fail(c, e);
  }
});

iptvRoutes.get("/lists/:listId/search-index", async (c) => {
  const found = await findList(c.get("member").id, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    return c.json(
      searchIndex(
        await getCatalog(c.get("member").id, found.list),
        found.prefs,
      ),
    );
  } catch (e) {
    return fail(c, e);
  }
});

iptvRoutes.get("/lists/:listId/:section/categories/:categoryId", async (c) => {
  const section = sectionSchema.safeParse(c.req.param("section"));
  const query = pageQuery.safeParse(c.req.query());
  if (!section.success || !query.success)
    return c.json({ error: "Pedido inválido." }, 400);
  const found = await findList(c.get("member").id, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    const catalog = await getCatalog(c.get("member").id, found.list);
    const page = categoryPage(
      catalog,
      found.prefs,
      section.data,
      c.req.param("categoryId"),
      query.data.page,
      query.data.size,
      {
        anchor: query.data.anchor,
        q: query.data.q,
        tag: query.data.tag,
        favorites: query.data.favorites === "1",
      },
    );
    return page ? c.json(page) : c.json({ error: NOT_AVAILABLE }, 404);
  } catch (e) {
    return fail(c, e);
  }
});

for (const section of ["movie", "series"] as const) {
  iptvRoutes.get(`/lists/:listId/${section}/:id`, async (c) => {
    const userId = c.get("member").id;
    const found = await findList(userId, c.req.param("listId"));
    if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
    const id = c.req.param("id");
    try {
      const catalog = await getCatalog(userId, found.list);
      if (!visibleItem(catalog, found.prefs, section, id))
        return c.json({ error: NOT_AVAILABLE }, 404);
      const detail =
        section === "movie"
          ? await getMovie(userId, found.list, id)
          : await getSeries(userId, found.list, id);
      return detail
        ? c.json(
            section === "movie"
              ? publicItem(detail)
              : publicSeriesDetail(detail as TVSeriesDetail),
          )
        : c.json({ error: NOT_AVAILABLE }, 404);
    } catch (e) {
      return fail(c, e);
    }
  });
}
