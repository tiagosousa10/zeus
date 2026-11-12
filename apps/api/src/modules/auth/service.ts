import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { twoFactor } from "better-auth/plugins";
import { db } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { sendTransactionalEmail } from "../email/service.js";
import { hashToken } from "../../lib/crypto.js";
import { config, trustedOrigins } from "../../lib/config.js";

export function createAuth(database: any = db) {
  return betterAuth({
    appName: "Zeus",
    baseURL: config.apiUrl,
    secret: config.authSecret,
    trustedOrigins,
    database: drizzleAdapter(database, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendTransactionalEmail({
          to: user.email,
          subject: "Repor palavra-passe Zeus",
          text: `Pediste para repor a tua palavra-passe no Zeus.\n\nAbre esta ligação para escolher uma nova palavra-passe: ${url}\n\nSe não fizeste este pedido, ignora este email.`,
          idempotencyKey: `zeus-reset/${hashToken(url)}`,
        });
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "member", input: false },
        active: { type: "boolean", defaultValue: true, input: false },
      },
    },
    plugins: [twoFactor({ issuer: "Zeus", skipVerificationOnEnable: false })],
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, window: 60, max: 30 },
  });
}
export const auth = createAuth();
