import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { config } from "./config.js";
const key = Buffer.from(config.encryptionKey, "hex");
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function encrypt(value: unknown) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    c.update(JSON.stringify(value), "utf8"),
    c.final(),
  ]);
  return [iv, c.getAuthTag(), body]
    .map((x) => x.toString("base64url"))
    .join(".");
}
export function decrypt(value: string) {
  const [iv, tag, body] = value
    .split(".")
    .map((s) => Buffer.from(s, "base64url"));
  if (value.split(".").length !== 3 || iv.length !== 12 || tag.length !== 16)
    throw new Error("Invalid encrypted state");
  const c = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  c.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([c.update(body), c.final()]).toString("utf8"),
  );
}
