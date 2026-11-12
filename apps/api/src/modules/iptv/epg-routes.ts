import { nowGuide, gridGuide, channelGuide } from "./controllers/epg.js";
import { Hono } from "hono";
export const epgRoutes = new Hono();
epgRoutes.get("/lists/:listId/epg/now", nowGuide);
epgRoutes.get("/lists/:listId/epg/grid", gridGuide);
epgRoutes.get("/lists/:listId/epg/channel/:id", channelGuide);
