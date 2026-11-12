import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { serveStatic } from "@hono/node-server/serve-static";
if (process.env.ZEUS_WEB_DIST) {
  const root = process.env.ZEUS_WEB_DIST;
  app.get("/api/*", (c) => c.json({ error: "Endpoint não encontrado." }, 404));
  app.use("/*", serveStatic({ root }));
  app.get("*", serveStatic({ path: root + "/index.html" }));
}

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT || 4310),
    hostname: "127.0.0.1",
  },
  (info) => console.log(`Zeus API: http://localhost:${info.port}`),
);
