import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";

const directory = mkdtempSync(join(tmpdir(), "zeus-auth-recovery-"));
const origin = "http://127.0.0.1:5174";
process.env.ZEUS_DATA_DIR = directory;
process.env.ZEUS_DATABASE_PATH = join(directory, "test.sqlite");
process.env.ZEUS_WEB_ORIGIN = origin;
process.env.BETTER_AUTH_URL = origin;
process.env.RESEND_API_KEY = "test-mail-transport";
process.env.RESEND_FROM = "Zeus <sender@example.test>";
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.DATABASE_URL;
const { app } = await import("../src/app.js");
const { query, closeDatabase } = await import("../src/db/client.js");
const password = "recovery-test-password-long";
const email = "recover@example.test";
let resetLink: URL;
const mail = test.mock.method(globalThis, "fetch", async (input, init) => {
  assert.equal(
    String(input),
    "https://api.resend.com/emails",
    "No other network is allowed",
  );
  const message = JSON.parse(String(init?.body));
  resetLink = new URL(message.text.match(/http:\/\/[^\s]+/)[0]);
  return Response.json({ id: "test-email" });
});

function client() {
  const cookies = new Map<string, string>();
  return async (path: string, body?: unknown) => {
    const response = await app.request(`${origin}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: [...cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  };
}
const member = client();
const anonymous = client();

function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "")]
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, "0"),
    )
    .join("");
  const bytes = Buffer.from(
    bits.match(/.{8}/g)!.map((part) => parseInt(part, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", bytes).update(counter).digest();
  return String((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1e6).padStart(
    6,
    "0",
  );
}

test.before(async () => {
  assert.equal(
    (await member("/bootstrap", { name: "Recovery", email, password })).status,
    200,
  );
  const enrollment = await member("/auth/two-factor/enable", { password });
  assert.equal(enrollment.status, 200);
  const { totpURI } = await enrollment.json();
  const code = totp(new URL(totpURI).searchParams.get("secret")!);
  assert.equal(
    (await member("/auth/two-factor/verify-totp", { code })).status,
    200,
  );
  assert.equal((await member("/state")).status, 200);
});

async function requestReset() {
  const response = await anonymous("/auth/request-password-reset", {
    email,
    redirectTo: `${origin}/entrada?reset=1`,
  });
  assert.equal(response.status, 200);
  return resetLink;
}

test("anonymous recovery follows the emailed callback and rejects invalid tokens", async () => {
  const link = await requestReset();
  const callback = await app.request(link.href);
  assert.equal(
    callback.status,
    302,
    "The emailed recovery link must work without a session",
  );
  const destination = new URL(callback.headers.get("location")!);
  assert.equal(destination.pathname, "/entrada");
  assert.equal(destination.searchParams.get("reset"), "1");
  assert.equal(
    destination.searchParams.get("token"),
    link.pathname.split("/").at(-1),
  );

  const invalid = new URL(link);
  invalid.pathname = "/api/auth/reset-password/invalid-token";
  const rejected = await app.request(invalid.href);
  assert.equal(rejected.status, 302);
  assert.equal(
    new URL(rejected.headers.get("location")!).searchParams.get("error"),
    "INVALID_TOKEN",
  );
  assert.equal(
    (await anonymous("/auth/reset-password/invalid-token", {})).status,
    401,
  );
  assert.equal((await anonymous("/auth/list-sessions")).status, 401);
});

test("password recovery revokes existing verified sessions and their TOTP grants", async () => {
  const link = await requestReset();
  assert.ok(
    (await query("select session_id from verified_session")).length > 0,
  );
  const token = link.pathname.split("/").at(-1);
  const newPassword = "replacement-test-password-long";
  const reset = await anonymous("/auth/reset-password", { token, newPassword });
  assert.equal(reset.status, 200);
  assert.equal(
    (await member("/state")).status,
    401,
    "An old verified cookie must stop granting access",
  );
  assert.deepEqual(await query("select session_id from verified_session"), []);
  assert.deepEqual(await query("select id from session"), []);
  assert.equal(
    (await anonymous("/auth/reset-password", { token, newPassword })).status,
    400,
  );
  const login = await anonymous("/auth/sign-in/email", {
    email,
    password: newPassword,
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).twoFactorRedirect, true);
  assert.equal((await anonymous("/state")).status, 401);
});

test.after(async () => {
  mail.mock.restore();
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});
