import {
  listSections,
  refreshList,
  listSearchIndex,
  listCategory,
  detailFor,
} from "./controllers/catalog.js";
import { Hono } from "hono";
import { requireMember } from "../auth/middleware.js";
import { epgRoutes } from "./epg-routes.js";
import { playRoutes } from "./play-routes.js";
export const iptvRoutes = new Hono();
iptvRoutes.use("*", requireMember);
iptvRoutes.route("/", playRoutes);
iptvRoutes.route("/", epgRoutes);
iptvRoutes.get("/lists/:listId", listSections);
iptvRoutes.post("/lists/:listId/refresh", refreshList);
iptvRoutes.get("/lists/:listId/search-index", listSearchIndex);
iptvRoutes.get("/lists/:listId/:section/categories/:categoryId", listCategory);
for (const section of ["movie", "series"] as const) {
  iptvRoutes.get(`/lists/:listId/${section}/:id`, detailFor(section));
}
