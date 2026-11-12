import {
  securityHeaders,
  corsPolicy,
  requestBodyLimit,
  validateOrigin,
} from "./middleware/security.js";
import { handleError } from "./middleware/errors.js";
import "./types.js";
import { metadataRoutes } from "./modules/catalog/routes.js";
import { iptvRoutes } from "./modules/iptv/routes.js";
import { motorRoutes } from "./modules/motor/routes.js";
import { streamRoutes } from "./modules/addons/stream-routes.js";
import { subtitleRoutes } from "./modules/addons/subtitle-routes.js";
import { Hono } from "hono";
import { authRoutes } from "./modules/auth/routes.js";
import { memberRoutes } from "./modules/member/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { addonRoutes, addonAdminRoutes } from "./modules/addons/routes.js";
export const app = new Hono();
app.use("*", securityHeaders);
app.use("/api/*", corsPolicy);
app.use("/api/*", requestBodyLimit);
app.use("/api/*", validateOrigin);
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/metadata", metadataRoutes);
app.route("/api/iptv", iptvRoutes);
app.route("/api/motor", motorRoutes);
app.route("/api/streams", streamRoutes);
app.route("/api/subtitles", subtitleRoutes);
app.route("/api", authRoutes);
app.route("/api/state", memberRoutes);
app.route("/api/admin/addons", addonAdminRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/addons", addonRoutes);
app.onError(handleError);
