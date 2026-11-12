import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHmac } from "node:crypto";
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM;
delete process.env.TURNSTILE_SECRET_KEY;
process.env.ZEUS_DATA_DIR = mkdtempSync(join(tmpdir(), "zeus-integration-"));
delete process.env.DATABASE_URL;
process.env.ZEUS_DATABASE_PATH = join(
  process.env.ZEUS_DATA_DIR!,
  "test.sqlite",
);
process.env.ZEUS_WEB_ORIGIN = "http://127.0.0.1:5174";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:5174";
const { db, query, closeDatabase } = await import("../src/db/client.js");
const { app } = await import("../src/app.js");
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((s) => parseInt(s, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", bytes).update(counter).digest();
  const off = h[19] & 15;
  return String((h.readUInt32BE(off) & 0x7fffffff) % 1e6).padStart(6, "0");
}
function client() {
  const cookies = new Map<string, string>();
  return async (path: string, body?: any, method = body ? "POST" : "GET") => {
    const response = await app.request(`http://127.0.0.1:5174/api${path}`, {
      method,
      headers: {
        origin: "http://127.0.0.1:5174",
        "content-type": "application/json",
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const c of response.headers.getSetCookie()) {
      const pair = c.split(";")[0],
        i = pair.indexOf("=");
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return { status: response.status, body: await response.json() };
  };
}
test("bootstrap, mandatory TOTP, invitations, member isolation and authorization", async () => {
  let a = client();
  const b = client(),
    anonymous = client(),
    contender = client(),
    partial = client();
  const password = "test-password-very-long";
  assert.equal((await anonymous("/bootstrap")).body.required, true);
  const attempts = await Promise.all([
    a("/bootstrap", {
      name: "Admin Test",
      email: "admin@example.test",
      password,
    }),
    contender("/bootstrap", {
      name: "Admin Test",
      email: "admin@example.test",
      password,
    }),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
  if (attempts[0].status !== 200) a = contender;
  assert.equal(
    (
      await partial("/auth/sign-in/email", {
        email: "admin@example.test",
        password,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await anonymous("/bootstrap", {
        name: "Race",
        email: "race@example.test",
        password,
      })
    ).status,
    409,
  );
  assert.equal((await a("/state")).status, 403);
  assert.equal(
    (
      await anonymous("/auth/sign-up/email", {
        name: "Intruder",
        email: "intruder@example.test",
        password,
      })
    ).status,
    403,
  );
  const setup = await a("/auth/two-factor/enable", { password });
  assert.equal(setup.status, 200, JSON.stringify(setup.body));
  assert.ok(
    [400, 401].includes(
      (await a("/auth/two-factor/verify-totp", { code: "000000" })).status,
    ),
  );
  const secret = new URL(setup.body.totpURI).searchParams.get("secret")!;
  const verify = await a("/auth/two-factor/verify-totp", {
    code: totp(secret),
  });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  assert.equal(
    (await partial("/state")).status,
    403,
    "Old sessions cannot bypass enrollment",
  );
  assert.equal(
    (await partial("/auth/two-factor/get-totp-uri", { password })).status,
    403,
    "Partial session must not recover the TOTP secret",
  );
  const saved = await a(
    "/state",
    { preferences: { tmdbKey: "private-admin-key" } },
    "PATCH",
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const { seedAddons } = await import("../src/db/seed-addons.js");
  assert.ok(
    (await query("select id from addon")).length > 300,
    "Seeds the swept add-on catalogue automatically",
  );
  assert.equal(await seedAddons(db), 0, "Seeding twice adds nothing");
  assert.ok(
    (await a("/addons")).body.addons.some(
      (x: any) =>
        Array.isArray(x.resources) && x.resources.includes("subtitles"),
    ),
  );
  await query(`insert into addon (id, name, manifest_url, status, configuration_required, configurable, resources)
    values ('test.keyed', 'Keyed', 'https://keyed.example.com/manifest.json', 'approved', true, true, '["stream","subtitles"]')`);
  assert.equal(
    (await a("/state", { addons: [{ id: "test.keyed" }] }, "PATCH")).status,
    400,
    "A keyed add-on needs its configured URL",
  );
  assert.equal(
    (
      await a(
        "/state",
        {
          addons: [
            {
              id: "test.keyed",
              manifestUrl: "https://other.example.net/k/manifest.json",
            },
          ],
        },
        "PATCH",
      )
    ).status,
    400,
    "The configured URL must stay on the approved host",
  );
  const keyed = await a(
    "/state",
    {
      addons: [
        {
          id: "test.keyed",
          manifestUrl: "https://keyed.example.com/secret-key-123/manifest.json",
        },
      ],
    },
    "PATCH",
  );
  assert.equal(keyed.status, 200, JSON.stringify(keyed.body));
  assert.ok(
    (await query("select ciphertext from member_state")).every(
      (r) => !r.ciphertext.includes("secret-key-123"),
    ),
  );
  assert.equal((await a("/state", { addons: [] }, "PATCH")).status, 200);
  assert.equal(
    (await a("/subtitles/file?url=https://example.com/x.srt&sig=forged"))
      .status,
    403,
    "The subtitle proxy only serves links the API signed",
  );
  const invitation = await a("/admin/invites", {
    email: "member@example.test",
  });
  assert.equal(invitation.status, 201, JSON.stringify(invitation.body));
  const token = new URL(invitation.body.url).searchParams.get("invite");
  assert.equal(
    (await b("/invites/accept", { token, name: "Member", password })).status,
    200,
  );
  assert.equal(
    (await b("/invites/accept", { token, name: "Reuse", password })).status,
    400,
  );
  const enrollment = await b("/auth/two-factor/enable", { password });
  assert.equal(enrollment.status, 200, JSON.stringify(enrollment.body));
  assert.equal(
    (
      await b("/auth/two-factor/verify-totp", {
        code: totp(
          new URL(enrollment.body.totpURI).searchParams.get("secret")!,
        ),
      })
    ).status,
    200,
  );
  assert.deepEqual((await b("/state")).body.preferences, {});
  assert.equal((await b("/admin/members")).status, 403);
  assert.equal((await anonymous("/state")).status, 401);
  const raw = await query("select ciphertext from member_state");
  assert.ok(raw.every((r) => !r.ciphertext.includes("private-admin-key")));
  const members = await a("/admin/members");
  const id = members.body.members.find(
    (x: any) => x.email === "member@example.test",
  ).id;
  assert.equal(
    (await a("/admin/members/" + id, { active: false }, "PATCH")).status,
    200,
  );
  assert.equal((await b("/state")).status, 401);
  assert.deepEqual((await a("/streams?type=movie&id=tt1234567")).body, {
    streams: [],
    errors: [],
  });
  const login = client();
  const challenge = await login("/auth/sign-in/email", {
    email: "admin@example.test",
    password,
  });
  assert.equal(challenge.body.twoFactorRedirect, true);
  assert.equal((await login("/state")).status, 401);
  const backup = await login("/auth/two-factor/verify-backup-code", {
    code: setup.body.backupCodes[0],
  });
  assert.equal(backup.status, 200, JSON.stringify(backup.body));
  assert.equal((await login("/state")).status, 200);
});
test.after(async () => {
  await closeDatabase();
});
