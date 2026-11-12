import { getMetadata } from "./controllers.js";
import { Hono } from "hono";
import { requireMember } from "../auth/middleware.js";
export const metadataRoutes = new Hono();
metadataRoutes.use("*", requireMember);
metadataRoutes.get("/", getMetadata);
