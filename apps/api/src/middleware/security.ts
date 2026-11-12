import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { development, trustedOrigins } from "../lib/config.js";
const origins = new Set(trustedOrigins);

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), fullscreen=(self), autoplay=(self)",
  );
  if (!development && !c.res.headers.has("Content-Security-Policy"))
    c.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "script-src 'self' https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: http: https:",
        "font-src 'self' data:",
        "media-src 'self' blob: http: https:",
        "connect-src 'self' http: https: ws: wss:",
        "frame-src https://challenges.cloudflare.com",
        "form-action 'self'",
      ].join("; "),
    );
};

export const corsPolicy: MiddlewareHandler = cors({
  origin: (o) => (origins.has(o) ? o : ""),
  credentials: true,
  allowHeaders: ["Content-Type", "x-turnstile-token"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
});

export const requestBodyLimit: MiddlewareHandler = bodyLimit({
  maxSize: 2 * 1024 * 1024,
});

export const validateOrigin: MiddlewareHandler = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && !origins.has(origin))
      return c.json({ error: "Origem não autorizada." }, 403);
  }
  c.header("Cache-Control", "no-store");
  await next();
};
