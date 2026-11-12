import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireMember } from "../auth/middleware.js";
import { getState } from "../member/service.js";
import { safeFetch } from "../../lib/safe-fetch.js";
import { getCatalog, getMovie, getSeries } from "./cache.js";
import { ProviderError } from "./provider.js";
import { prefsFor } from "./prefs.js";
import { categoryPage, publicItem, publicSeriesDetail, searchIndex, sectionsView, visibleItem } from "./views.js";
import type { IPTVList, TVSeriesDetail } from "./types.js";
export const iptvRoutes = new Hono();
iptvRoutes.use("*", requireMember);
iptvRoutes.get("/resource", async (c) => {
  const state = await getState(c.get("member").id);
  const list = (state.iptv as any[]).find(
    (l) => l.id === c.req.query("listId"),
  );
  if (!list) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  const kind = c.req.query("kind");
  let url: string;
  if (kind === "epg") {
    if (!list.epgUrl)
      return c.json({ error: "Esta lista não tem um URL XMLTV." }, 400);
    url = list.epgUrl;
  } else if (list.type === "xtream") {
    const u = new URL("/player_api.php", list.url);
    u.searchParams.set("username", list.username || "");
    u.searchParams.set("password", list.password || "");
    u.searchParams.set("action", "get_live_streams");
    url = u.href;
  } else url = list.url;
  try {
    const r = await safeFetch(url);
    if (!r.ok)
      return c.json({ error: `O fornecedor respondeu com ${r.status}.` }, 502);
    const text = await r.text();
    return c.body(text, 200, {
      "Content-Type":
        kind === "epg"
          ? "application/xml"
          : list.type === "xtream"
            ? "application/json"
            : "text/plain",
    });
  } catch (e) {
    return c.json(
      {
        error:
          e instanceof Error ? e.message : "Não foi possível carregar a lista.",
      },
      502,
    );
  }
});

const sectionSchema = z.enum(["live", "movie", "series"]);
const pageQuery = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(200).default(60),
});
const NOT_AVAILABLE = "Este conteúdo não está disponível.";

async function findList(userId: string, listId: string) {
  const state = await getState(userId);
  const list = (state.iptv as IPTVList[]).find((l) => l.id === listId);
  return list ? { list, prefs: prefsFor(state as { tv?: Record<string, unknown> }, listId) } : undefined;
}

function fail(c: Context, e: unknown) {
  if (e instanceof ProviderError) return c.json({ error: e.message }, 502);
  throw e;
}

iptvRoutes.get("/lists/:listId", async (c) => {
  const found = await findList(c.get("member").id, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    return c.json(sectionsView(await getCatalog(c.get("member").id, found.list), found.prefs));
  } catch (e) {
    return fail(c, e);
  }
});

iptvRoutes.post("/lists/:listId/refresh", async (c) => {
  const found = await findList(c.get("member").id, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    return c.json(sectionsView(await getCatalog(c.get("member").id, found.list, { force: true }), found.prefs));
  } catch (e) {
    return fail(c, e);
  }
});

iptvRoutes.get("/lists/:listId/search-index", async (c) => {
  const found = await findList(c.get("member").id, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    return c.json(searchIndex(await getCatalog(c.get("member").id, found.list), found.prefs));
  } catch (e) {
    return fail(c, e);
  }
});

iptvRoutes.get("/lists/:listId/:section/categories/:categoryId", async (c) => {
  const section = sectionSchema.safeParse(c.req.param("section"));
  const query = pageQuery.safeParse(c.req.query());
  if (!section.success || !query.success) return c.json({ error: "Pedido inválido." }, 400);
  const found = await findList(c.get("member").id, c.req.param("listId"));
  if (!found) return c.json({ error: "Lista IPTV não encontrada." }, 404);
  try {
    const catalog = await getCatalog(c.get("member").id, found.list);
    const page = categoryPage(catalog, found.prefs, section.data, c.req.param("categoryId"), query.data.page, query.data.size);
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
      if (!visibleItem(catalog, found.prefs, section, id)) return c.json({ error: NOT_AVAILABLE }, 404);
      const detail = section === "movie" ? await getMovie(userId, found.list, id) : await getSeries(userId, found.list, id);
      return detail ? c.json(section === "movie" ? publicItem(detail) : publicSeriesDetail(detail as TVSeriesDetail)) : c.json({ error: NOT_AVAILABLE }, 404);
    } catch (e) {
      return fail(c, e);
    }
  });
}
