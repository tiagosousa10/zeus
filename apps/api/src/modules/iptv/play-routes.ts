import {
  stopPlayback,
  startPlayback,
  indexPlaylist,
  playResource,
  playLive,
  playFile,
  playRemux,
} from "./controllers/play.js";
import { Hono } from "hono";
export const playRoutes = new Hono();
playRoutes.post("/play/:token/stop", stopPlayback);
playRoutes.post("/lists/:listId/play", startPlayback);
playRoutes.get("/play/:token/index.m3u8", indexPlaylist);
playRoutes.get("/play/:token/r/:id", playResource);
playRoutes.get("/play/:token/live.ts", playLive);
playRoutes.get("/play/:token/file", playFile);
playRoutes.get("/play/:token/remux.mp4", playRemux);
