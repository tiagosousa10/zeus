import {
  motorStatus,
  startMotor,
  streamMotor,
  stopMotor,
} from "./controllers.js";
import { Hono } from "hono";
import { requireMember } from "../auth/middleware.js";
export const motorRoutes = new Hono();
motorRoutes.use("*", requireMember);
motorRoutes.get("/status", motorStatus);
motorRoutes.post("/start", startMotor);
motorRoutes.get("/stream/:hash/:index", streamMotor);
motorRoutes.post("/stop", stopMotor);
