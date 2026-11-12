import { listSubtitles, subtitleFile } from "./subtitle-controller.js";
import { Hono } from "hono";
import { requireMember } from "../auth/middleware.js";
export const subtitleRoutes = new Hono();
subtitleRoutes.use("*", requireMember);
subtitleRoutes.get("/", listSubtitles);
subtitleRoutes.get("/file", subtitleFile);
