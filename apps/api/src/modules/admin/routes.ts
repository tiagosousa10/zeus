import {
  listMembers,
  updateMember,
  listInvites,
  createInvite,
  deleteInvite,
} from "./controllers.js";
import { Hono } from "hono";
import { requireMember, requireAdmin } from "../auth/middleware.js";
export const adminRoutes = new Hono();
adminRoutes.use("*", requireMember, requireAdmin);
adminRoutes.get("/members", listMembers);
adminRoutes.patch("/members/:id", updateMember);
adminRoutes.get("/invites", listInvites);
adminRoutes.post("/invites", createInvite);
adminRoutes.delete("/invites/:id", deleteInvite);
