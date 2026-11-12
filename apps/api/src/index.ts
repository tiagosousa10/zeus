import { closeDatabase } from "./db/client.js";
import { clearSessions } from "./modules/iptv/services/sessions.js";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { serveStatic } from "@hono/node-server/serve-static";
if (process.env.ZEUS_WEB_DIST) {
  const root = process.env.ZEUS_WEB_DIST;
  app.get("/api/*", (c) => c.json({ error: "Endpoint não encontrado." }, 404));
  app.use("/*", serveStatic({ root }));
  app.get("*", serveStatic({ path: root + "/index.html" }));
}

const server = serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT || 4310),
    hostname: "127.0.0.1",
  },
  (info) => {
    console.log(`Zeus API: http://127.0.0.1:${info.port}`);
    (process as any).parentPort?.postMessage({ ready: true, port: info.port });
  },
);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearSessions();
  server.close();
  if ("closeAllConnections" in server) server.closeAllConnections();
  await closeDatabase();
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void shutdown());
(process as any).parentPort?.on("message", (event: { data: unknown }) => {
  if (event.data === "stop") void shutdown();
});
