import { readMemberState, updateMemberState } from "./controllers.js";
import { Hono } from "hono";
import { requireMember } from "../auth/middleware.js";
export const memberRoutes = new Hono();
memberRoutes.use("*", requireMember);
memberRoutes.get("/", readMemberState);
memberRoutes.patch("/", updateMemberState);
