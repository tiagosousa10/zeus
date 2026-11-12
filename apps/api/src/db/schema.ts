import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: time("createdAt").notNull(),
  updatedAt: time("updatedAt").notNull(),
  twoFactorEnabled: boolean("twoFactorEnabled").default(false),
  role: text("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: time("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: time("createdAt").notNull(),
  updatedAt: time("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: time("accessTokenExpiresAt"),
  refreshTokenExpiresAt: time("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: time("createdAt").notNull(),
  updatedAt: time("updatedAt").notNull(),
});
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: time("expiresAt").notNull(),
  createdAt: time("createdAt").notNull(),
  updatedAt: time("updatedAt").notNull(),
});
export const twoFactor = pgTable("twoFactor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backupCodes").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  verified: boolean("verified").default(false),
  failedVerificationCount: integer("failedVerificationCount").default(0),
  lockedUntil: time("lockedUntil"),
});
export const memberState = pgTable("member_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const invite = pgTable("invite", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: time("created_at").notNull().defaultNow(),
  expiresAt: time("expires_at").notNull(),
  usedAt: time("used_at"),
});
export const addon = pgTable("addon", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  manifestUrl: text("manifest_url").notNull().unique(),
  status: text("status").notNull().default("pending"),
  configFields: jsonb("config_fields").notNull().default([]),
  configurationRequired: boolean("configuration_required")
    .notNull()
    .default(false),
  configurable: boolean("configurable").notNull().default(false),
  resources: jsonb("resources").$type<string[]>().notNull().default(["stream"]),
});
