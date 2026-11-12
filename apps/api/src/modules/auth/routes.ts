import {
  bootstrapStatus,
  authConfiguration,
  bootstrapAdministrator,
  acceptInvitation,
  currentSession,
  handleAuthentication,
} from "./controllers.js";
import { Hono } from "hono";
export const authRoutes = new Hono();
authRoutes.get("/bootstrap", bootstrapStatus);
authRoutes.get("/config", authConfiguration);
authRoutes.post("/bootstrap", bootstrapAdministrator);
authRoutes.post("/invites/accept", acceptInvitation);
authRoutes.get("/session", currentSession);
authRoutes.all("/auth/*", handleAuthentication);
