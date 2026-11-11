import "./types.js";
import { metadataRoutes } from "./modules/catalog/routes.js";
import { iptvRoutes } from "./modules/iptv/routes.js";
import { motorRoutes } from "./modules/motor/routes.js";
import { streamRoutes } from "./modules/addons/streams.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { config } from "./lib/config.js";
import { authRoutes } from "./modules/auth/routes.js";
import { memberRoutes } from "./modules/member/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { addonRoutes, addonAdminRoutes } from "./modules/addons/routes.js";
export const app = new Hono();
const origins = new Set([
  config.origin,
  "http://localhost:5174",
  "http://127.0.0.1:5174",
]);
app.use(
  "/api/*",
  cors({
    origin: (o) => (origins.has(o) ? o : ""),
    credentials: true,
    allowHeaders: ["Content-Type", "x-turnstile-token"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use("/api/*", bodyLimit({ maxSize: 2 * 1024 * 1024 }));
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && !origins.has(origin))
      return c.json({ error: "Origem não autorizada." }, 403);
  }
  c.header("Cache-Control", "no-store");
  await next();
});
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/metadata", metadataRoutes);
app.route("/api/iptv", iptvRoutes);
app.route("/api/motor", motorRoutes);
app.route("/api/streams", streamRoutes);
app.route("/api", authRoutes);
app.route("/api/state", memberRoutes);
app.route("/api/admin/addons", addonAdminRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/addons", addonRoutes);
app.onError((e, c) => {
  if (e instanceof ZodError)
    return c.json(
      {
        error: "Dados inválidos.",
        details: e.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      400,
    );
  if (e instanceof HTTPException) return c.json({ error: e.message }, e.status);
  console.error(e.name, e.message);
  return c.json({ error: "Não foi possível concluir o pedido." }, 500);
});
