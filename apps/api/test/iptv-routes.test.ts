import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { fakeFetch, xtreamRoutes } from "./fixtures/xtream.js";
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM;
delete process.env.TURNSTILE_SECRET_KEY;
process.env.ZEUS_DATA_DIR = mkdtempSync(join(tmpdir(), "zeus-iptv-routes-"));
delete process.env.DATABASE_URL;
process.env.ZEUS_DATABASE_PATH = join(process.env.ZEUS_DATA_DIR!, "test.sqlite");
process.env.ZEUS_WEB_ORIGIN = "http://127.0.0.1:5174";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:5174";
const { db, query, closeDatabase } = await import("../src/db/client.js");
const { app } = await import("../src/app.js");
const { setProviderFetch } = await import("../src/modules/iptv/provider.js");
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
    const text = await response.text();
    return {
      status: response.status,
      body: response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : text,
      text,
    };
  };
}

test("IPTV routes serve the member's list without leaking credentials", async () => {
  const a = client();
  const password = "test-password-very-long";
  const boot = await a("/bootstrap", {
    name: "Admin Test",
    email: "admin@example.test",
    password,
  });
  assert.equal(boot.status, 200, boot.text);
  const setup = await a("/auth/two-factor/enable", { password });
  assert.equal(setup.status, 200, setup.text);
  const secret = new URL(setup.body.totpURI).searchParams.get("secret")!;
  assert.equal(
    (await a("/auth/two-factor/verify-totp", { code: totp(secret) })).status,
    200,
  );

  const list = {
    id: "l1",
    name: "Casa",
    type: "xtream",
    url: "https://tv.example.test/",
    username: "u",
    password: "segredo-123",
  };
  const saved = await a("/state", { iptv: [list] }, "PATCH");
  assert.equal(saved.status, 200, saved.text);
  const { getState } = await import("../src/modules/member/service.js");
  const userId = (await a("/session")).body.user.id;
  const readList = async () => (await getState(userId)).iptv[0];
  const publicList = saved.body.iptv[0];
  for (const response of [saved, await a("/state")]) {
    assert.deepEqual(Object.keys(response.body.iptv[0]).sort(), [
      "configured",
      "id",
      "name",
      "type",
    ]);
    assert.ok(
      !response.text.includes(list.url) &&
        !response.text.includes(list.password),
    );
  }
  assert.equal((await a("/iptv/resource?listId=l1")).status, 404);
  assert.equal(
    (await a("/state", { iptv: [{ ...publicList, name: "Renamed" }] }, "PATCH"))
      .status,
    200,
  );
  assert.deepEqual(await readList(), { ...list, name: "Renamed" });
  await a("/state", { preferences: { test: true } }, "PATCH");
  assert.equal((await readList()).password, list.password);
  assert.equal(
    (
      await a(
        "/state",
        { iptv: [{ id: "new", name: "Invalid", type: "xtream" }] },
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal((await readList()).id, "l1");
  const replacement = {
    url: "https://replacement.example.test/token",
    username: "replacement-user",
    password: "replacement-secret",
    epgUrl: "https://epg.example.test/?token=private",
  };
  const replaced = await a(
    "/state",
    { iptv: [{ ...publicList, ...replacement }] },
    "PATCH",
  );
  assert.equal(replaced.status, 200, replaced.text);
  assert.ok(
    Object.values(replacement).every((v) => !replaced.text.includes(v)),
  );
  assert.deepEqual(await readList(), { ...list, ...replacement });
  await a("/state", { iptv: [{ ...publicList, epgUrl: "" }] }, "PATCH");
  assert.equal((await readList()).epgUrl, "");
  await a("/state", { iptv: [] }, "PATCH");
  assert.deepEqual((await getState(userId)).iptv, []);
  await a("/state", { iptv: [list] }, "PATCH");
  const provider = fakeFetch(xtreamRoutes);
  setProviderFetch(provider);

  const sections = await a("/iptv/lists/l1");
  assert.equal(sections.status, 200, sections.text);
  assert.ok(provider.calls.length > 0);
  assert.ok(
    provider.calls.every(
      (url) =>
        url.searchParams.get("username") === list.username &&
        url.searchParams.get("password") === list.password,
    ),
  );
  assert.deepEqual(Object.keys(sections.body.sections), [
    "live",
    "movie",
    "series",
  ]);
  assert.ok(!sections.text.includes("segredo-123"));

  const unknown = await a("/iptv/lists/nope");
  assert.deepEqual(
    [unknown.status, unknown.body.error],
    [404, "Lista IPTV não encontrada."],
  );

  assert.equal((await a("/iptv/lists/l1/radio/categories/1")).status, 400);

  const adult = await a("/iptv/lists/l1/live/categories/2");
  assert.deepEqual(
    [adult.status, adult.body.error],
    [404, "Este conteúdo não está disponível."],
  );

  const movie = await a("/iptv/lists/l1/movie/201");
  assert.equal(movie.status, 200, movie.text);
  assert.equal(movie.body.plot, "Uma história.");
  assert.equal("source" in movie.body, false);
  assert.ok(!movie.text.includes("segredo-123"));

  setProviderFetch(async () => {
    throw new Error(
      "connect ECONNREFUSED https://tv.example.test/?password=segredo-123",
    );
  });
  const failed = await a("/iptv/lists/l1/refresh", {});
  assert.deepEqual(
    [failed.status, failed.body.error],
    [502, "O fornecedor da lista não respondeu. Tenta de novo."],
  );
  assert.ok(!failed.text.includes("segredo-123"));

  assert.equal((await client()("/iptv/lists/l1")).status, 401);
});

test.after(async () => {
  await closeDatabase();
});
