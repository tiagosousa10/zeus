import { listStreams } from "./stream-controller.js";
import { Hono } from "hono";
import { requireMember } from "../auth/middleware.js";
export const streamRoutes = new Hono();
streamRoutes.use("*", requireMember);
streamRoutes.get("/", listStreams);
