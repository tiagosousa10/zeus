import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve("apps/web"),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WEB_PORT || 5174),
    strictPort: true,
    proxy: {
      "/api": { target: process.env.API_TARGET || "http://127.0.0.1:4310" },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
