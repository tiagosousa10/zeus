import { Hono } from "hono";
import { requireMember } from "../auth/middleware.js";
import { getState } from "../member/service.js";
import { safeFetch } from "../../lib/safe-fetch.js";
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
