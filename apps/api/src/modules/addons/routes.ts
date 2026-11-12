import {
  listApprovedAddons,
  listAllAddons,
  updateAddon,
  syncAddons,
} from "./controllers.js";
import { Hono } from "hono";
import { requireMember, requireAdmin } from "../auth/middleware.js";
export const addonRoutes = new Hono();
addonRoutes.use("*", requireMember);
addonRoutes.get("/", listApprovedAddons);
export const addonAdminRoutes = new Hono();
addonAdminRoutes.use("*", requireMember, requireAdmin);
addonAdminRoutes.get("/", listAllAddons);
addonAdminRoutes.patch("/:id", updateAddon);
addonAdminRoutes.post("/sync", syncAddons);
