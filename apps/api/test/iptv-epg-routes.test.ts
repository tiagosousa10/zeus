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
process.env.ZEUS_DATA_DIR = mkdtempSync(join(tmpdir(), "zeus-epg-routes-"));
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

test("guide routes enforce visibility, ownership, windows and favorites", async () => {
  const a = client();
  const password = "test-password-very-long";
  assert.equal(
    (
      await a("/bootstrap", {
        name: "Admin Test",
        email: "admin@example.test",
        password,
      })
    ).status,
    200,
  );
  const setup = await a("/auth/two-factor/enable", { password });
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
  assert.equal((await a("/state", { iptv: [list] }, "PATCH")).status, 200);
  setProviderFetch(fakeFetch(xtreamRoutes));
  const { setGuideFetch } = await import("../src/modules/iptv/epg.js");
  const { defaultPrefs } = await import("../src/modules/iptv/prefs.js");
  const { clearMemoryCache } = await import("../src/modules/iptv/cache.js");
  const now = Date.now();
  const xmlDate = (n: number) =>
    new Date(n).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  let shortCalls = 0;
  setGuideFetch(async (input) => {
    if (new URL(input).pathname === "/xmltv.php")
      return new Response(
        `<tv><programme start="${xmlDate(now - 1800_000)}" stop="${xmlDate(now + 1800_000)}" channel="rtp1.pt"><title>Agora</title></programme><programme start="${xmlDate(now + 1800_000)}" stop="${xmlDate(now + 3600_000)}" channel="rtp1.pt"><title>Seguinte</title></programme></tv>`,
      );
    shortCalls++;
    return Response.json({
      epg_listings: [
        {
          title: "U0lD",
          start_timestamp: Math.floor((now - 1800_000) / 1000),
          stop_timestamp: Math.floor((now + 1800_000) / 1000),
        },
      ],
    });
  });
  const path = "/iptv/lists/l1/epg";
  const nn = await a(path + "/now?category=1");
  assert.equal(nn.status, 200, nn.text);
  assert.deepEqual(Object.keys(nn.body), ["101"]);
  assert.equal(nn.body["101"].now.title, "Agora");
  assert.equal(nn.body["101"].next.title, "Seguinte");
  assert.ok(!nn.text.includes("segredo-123"));
  const window = `from=${now - 3600_000}&to=${now + 3600_000}`;
  const grid = await a(path + "/grid?" + window);
  assert.equal(grid.status, 200, grid.text);
  assert.equal(grid.body.total, 2);
  assert.deepEqual(
    grid.body.channels.map((c: any) => c.id),
    ["101", "102"],
  );
  assert.equal(grid.body.channels[0].programmes[0].title, "Agora");
  assert.deepEqual(grid.body.channels[1].programmes, []);
  assert.ok(!grid.text.includes("source"));
  assert.equal(grid.body.channels[0].categoryId, "1");
  assert.ok(grid.body.availableDays.length > 0);
  assert.ok(
    grid.body.availableDays.every((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  );
  const anchoredDock = await a(
    "/iptv/lists/l1/live/categories/1?page=0&size=1&anchor=102",
  );
  assert.equal(anchoredDock.status, 200);
  assert.equal(anchoredDock.body.page, 1);
  assert.equal(anchoredDock.body.items[0].id, "102");
  const localGrid = await a(
    path + "/grid?" + window + "&timezone=Europe%2FLisbon",
  );
  assert.equal(localGrid.status, 200);
  assert.equal(localGrid.body.availability.timezone, "Europe/Lisbon");
  assert.ok(
    localGrid.body.availability.to - localGrid.body.availability.from <=
      12 * 86400000,
  );
  assert.equal(
    (await a(path + "/grid?" + window + "&timezone=invalid%2Fzone")).status,
    400,
  );
  const page = await a(path + "/grid?" + window + "&page=1&size=1");
  assert.deepEqual(
    [page.body.total, page.body.page, page.body.size, page.body.channels[0].id],
    [2, 1, 1, "102"],
  );
  assert.deepEqual(
    (await a(path + "/grid?" + window + "&favorites=1")).body.channels,
    [],
  );
  for (const query of [
    `from=0&to=90000000`,
    `from=2&to=1`,
    `from=x&to=2`,
    window + "&page=-1",
    window + "&size=201",
  ])
    assert.equal((await a(path + "/grid?" + query)).status, 400);
  for (const id of ["103", "104", "missing"])
    assert.equal((await a(path + "/channel/" + id + "?" + window)).status, 404);
  assert.equal((await a(path + "/now?category=2")).status, 404);
  assert.equal((await a(path + "/grid?" + window + "&category=2")).status, 404);
  assert.equal(shortCalls, 0);
  assert.equal((await a(path + "/channel/102?" + window)).body[0].title, "SIC");
  assert.equal(shortCalls, 1);
  assert.equal(
    (await a(path + "/channel/101?" + window)).body[0].title,
    "Agora",
  );
  assert.equal(shortCalls, 1);
  const prefs = defaultPrefs();
  prefs.favorites.live = ["101", "104"];
  prefs.hidden.live = ["1"];
  await a("/state", { tv: { l1: prefs } }, "PATCH");
  assert.equal((await a(path + "/channel/101?" + window)).status, 404);
  assert.deepEqual(
    (await a(path + "/grid?" + window + "&favorites=1")).body.channels,
    [],
  );
  prefs.hidden.live = [];
  await a("/state", { tv: { l1: prefs } }, "PATCH");
  assert.deepEqual(
    (await a(path + "/grid?" + window + "&favorites=1")).body.channels.map(
      (c: any) => c.id,
    ),
    ["101"],
  );
  assert.equal((await client()(path + "/now?category=1")).status, 401);
  assert.equal((await a("/iptv/lists/missing/epg/grid?" + window)).status, 404);
  clearMemoryCache();
  setGuideFetch(async () => {
    throw new Error("https://tv.example.test/segredo-123");
  });
  const failure = await a(path + "/now?category=1");
  assert.equal(failure.status, 502);
  assert.ok(!/segredo|example/.test(failure.text));
  const m3u = {
    id: "m3u",
    name: "Sem guia",
    type: "m3u",
    url: "https://tv.example.test/list.m3u",
  };
  await a("/state", { iptv: [m3u] }, "PATCH");
  setProviderFetch(
    async () =>
      new Response(
        '#EXTM3U\n#EXTINF:-1 group-title="Portugal",RTP 1\nhttps://tv.example.test/live/1.ts',
      ),
  );
  const catalog = await a("/iptv/lists/m3u");
  const category = catalog.body.sections.live.categories[0].id;
  const search = await a("/iptv/lists/m3u/search-index");
  const epg = "/iptv/lists/m3u/epg";
  assert.deepEqual((await a(epg + "/now?category=" + category)).body, {});
  const emptyGrid = (await a(epg + "/grid?" + window)).body;
  assert.equal(emptyGrid.availability.timezone, "UTC");
  delete emptyGrid.availability;
  assert.deepEqual(emptyGrid, {
    availableDays: [],
    channels: [],
    total: 0,
    page: 0,
    size: 40,
  });
  assert.deepEqual(
    (await a(epg + "/channel/" + search.body[0].id + "?" + window)).body,
    [],
  );
});
test.after(async () => {
  await closeDatabase();
});
