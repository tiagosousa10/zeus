import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import postgres from "postgres";
import { fakeFetch, xtreamRoutes } from "./fixtures/xtream.js";
import { fakeUpstream, type FakeResource } from "./fixtures/upstream.js";
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM;
delete process.env.TURNSTILE_SECRET_KEY;
process.env.ZEUS_DATA_DIR = mkdtempSync(join(tmpdir(), "zeus-iptv-play-"));
const base =
  process.env.DATABASE_URL || "postgres://zeus:zeus_local@127.0.0.1:55439/zeus";
const schema = "test_" + randomBytes(6).toString("hex");
const control = postgres(base, { max: 1 });
await control.unsafe(`create schema ${schema}`);
const url = new URL(base);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
process.env.ZEUS_WEB_ORIGIN = "http://127.0.0.1:5174";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:5174";
const { sql } = await import("../src/db/client.js");
await sql.unsafe(
  readFileSync(new URL("../src/db/setup.sql", import.meta.url), "utf8"),
);
const { app } = await import("../src/app.js");
const { setProviderFetch } = await import("../src/modules/iptv/provider.js");
const { setUpstreamFetch } = await import("../src/modules/iptv/play-routes.js");
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
  const raw = (path: string, init: { body?: any; method?: string; headers?: Record<string, string> } = {}) =>
    app.request(`http://127.0.0.1:5174/api${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        origin: "http://127.0.0.1:5174",
        "content-type": "application/json",
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...init.headers,
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  const call = async (path: string, body?: any, method = body ? "POST" : "GET") => {
    const response = await raw(path, { body, method });
    for (const c of response.headers.getSetCookie()) {
      const pair = c.split(";")[0],
        i = pair.indexOf("=");
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await response.text();
    const json = response.headers.get("content-type")?.includes("json");
    return { status: response.status, body: json ? JSON.parse(text) : undefined, text, type: response.headers.get("content-type") };
  };
  return Object.assign(call, { raw });
}

async function verify(c: ReturnType<typeof client>, password: string) {
  const setup = await c("/auth/two-factor/enable", { password });
  assert.equal(setup.status, 200, setup.text);
  const secret = new URL(setup.body.totpURI).searchParams.get("secret")!;
  assert.equal((await c("/auth/two-factor/verify-totp", { code: totp(secret) })).status, 200);
}

const ORIGIN = "https://tv.example.test/live/u/segredo-123";
const EDGE = "https://edge.cdn.test/hls/u/segredo-123/101";
const upstream: Record<string, FakeResource> = {
  [`${ORIGIN}/101.m3u8`]: {
    url: `${EDGE}/master.m3u8`,
    headers: { "content-type": "application/vnd.apple.mpegurl" },
    body: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200000\nv?x=1\n",
  },
  [`${EDGE}/v?x=1`]: {
    headers: { "content-type": "text/plain" },
    body: "#EXTM3U\n#EXTINF:6.0,\nhttps://cdn.test/segredo-123/v1.ts\n",
  },
  [`${EDGE}/low/odd`]: {
    headers: { "content-type": "text/plain" },
    body: "\uFEFF \n#EXTM3U\n#EXTINF:6.0,\nhttps://cdn.test/segredo-123/odd1.ts\n",
  },
  [`${EDGE}/low/index.m3u8`]: {
    body: "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg1.ts\n#EXTINF:6.0,\nhttps://cdn.test/segredo-123/seg2.ts\n#EXTINF:6.0,\nodd\n",
  },
  [`${EDGE}/low/seg1.ts`]: { headers: { "content-type": "video/mp2t" }, body: "SEGMENT-1", open: true },
  [`${ORIGIN}/102.m3u8`]: { status: 509, body: "max connections https://tv.example.test" },
};
const links = (text: string) => text.split("\n").filter((l) => l.startsWith("/api/iptv/play/"));
const leaks = (text: string) => /segredo-123|tv\.example\.test|cdn\.test/.test(text);

test("playback starts through the API and HLS never reveals the provider", async () => {
  const a = client();
  const password = "test-password-very-long";
  const boot = await a("/bootstrap", { name: "Admin Test", email: "admin@example.test", password });
  assert.equal(boot.status, 200, boot.text);
  await verify(a, password);
  const invitation = await a("/admin/invites", { email: "member@example.test" });
  assert.equal(invitation.status, 201, invitation.text);
  const b = client();
  const invite = new URL(invitation.body.url).searchParams.get("invite");
  assert.equal((await b("/invites/accept", { token: invite, name: "Member", password })).status, 200);
  await verify(b, password);

  const list = { id: "l1", name: "Casa", type: "xtream", url: "https://tv.example.test/", username: "u", password: "segredo-123" };
  const local = { id: "l2", name: "Local", type: "m3u", url: "http://127.0.0.1/" };
  assert.equal((await a("/state", { iptv: [list, local] }, "PATCH")).status, 200);
  setProviderFetch(fakeFetch(xtreamRoutes));
  const fake = fakeUpstream(upstream);
  setUpstreamFetch(fake);

  assert.equal((await a("/iptv/lists/l1/play", { section: "series", id: "301" })).status, 400);
  const play = await a("/iptv/lists/l1/play", { section: "live", id: "101" });
  assert.equal(play.status, 200, play.text);
  assert.equal(play.body.type, "hls");
  assert.equal(play.body.remux, false);
  assert.equal(play.body.url, `/api/iptv/play/${play.body.token}/index.m3u8`);
  assert.ok(!leaks(play.text));

  const master = await a(play.body.url.slice(4));
  assert.equal(master.status, 200, master.text);
  assert.equal(master.type, "application/vnd.apple.mpegurl");
  assert.ok(!leaks(master.text), master.text);
  const [variantLink, plainVariantLink] = links(master.text);
  assert.match(variantLink, new RegExp(`^/api/iptv/play/${play.body.token}/r/\\w+$`));

  const adult = await a("/iptv/lists/l1/play", { section: "live", id: "104" });
  assert.deepEqual([adult.status, adult.body.error], [404, "Este conteúdo não está disponível."]);
  const still = await a(play.body.url.slice(4));
  assert.equal(still.status, 200, still.text);
  assert.deepEqual(links(still.text), links(master.text));

  const plain = await a(plainVariantLink.slice(4));
  assert.equal(plain.type, "application/vnd.apple.mpegurl");
  assert.equal(links(plain.text).length, 1);
  assert.ok(!leaks(plain.text), plain.text);

  const media = await a(variantLink.slice(4));
  assert.equal(media.status, 200, media.text);
  assert.equal(media.type, "application/vnd.apple.mpegurl");
  assert.ok(!leaks(media.text), media.text);
  assert.equal(links(media.text).length, 3);
  const sniffed = await a(links(media.text)[2].slice(4));
  assert.equal(sniffed.type, "application/vnd.apple.mpegurl");
  assert.equal(links(sniffed.text).length, 1);
  assert.ok(!leaks(sniffed.text), sniffed.text);

  const segment = await a.raw(links(media.text)[0].slice(4), { headers: { range: "bytes=0-" } });
  assert.equal(segment.status, 200);
  assert.equal(segment.headers.get("content-type"), "video/mp2t");
  assert.equal(segment.headers.get("x-content-type-options"), "nosniff");
  assert.equal(segment.headers.get("content-security-policy"), "sandbox");
  const reader = segment.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "SEGMENT-1");
  const segmentCall = fake.calls.find((c) => c.url === `${EDGE}/low/seg1.ts`)!;
  assert.equal(segmentCall.headers?.range, "bytes=0-");
  assert.equal(segmentCall.signal?.aborted, false);

  assert.equal((await b(play.body.url.slice(4))).status, 404);
  assert.equal((await a("/iptv/play/nope/index.m3u8")).status, 404);

  const second = await a("/iptv/lists/l1/play", { section: "live", id: "102" });
  assert.equal(second.status, 200, second.text);
  const ended = await a(play.body.url.slice(4));
  assert.deepEqual([ended.status, ended.body.error], [410, "Esta reprodução terminou."]);
  assert.equal(segmentCall.signal?.aborted, true);
  await assert.rejects(reader.read());

  const limited = await a(second.body.url.slice(4));
  assert.equal(limited.status, 502);
  assert.match(limited.body.error, /já está a ser usada noutro aparelho \(máximo de 1 ligação\(ões\)\)/);
  assert.ok(!leaks(limited.text));

  upstream[`${ORIGIN}/102.m3u8`].status = 500;
  const down = await a(second.body.url.slice(4));
  assert.deepEqual([down.status, down.body.error], [502, "O fornecedor não respondeu. Tenta de novo."]);

  Object.assign(upstream[`${ORIGIN}/102.m3u8`], { status: 200, body: "#EXTM3U\n" + "#".repeat(2 * 1024 * 1024) });
  const huge = await a(second.body.url.slice(4));
  assert.deepEqual([huge.status, huge.body.error], [502, "O fornecedor não respondeu. Tenta de novo."]);

  const mp4 = await a("/iptv/lists/l1/play", { section: "movie", id: "201" });
  assert.deepEqual([mp4.body.type, mp4.body.remux, mp4.body.url], ["mp4", false, `/api/iptv/play/${mp4.body.token}/file`]);
  const mkv = await a("/iptv/lists/l1/play", { section: "movie", id: "202" });
  assert.deepEqual([mkv.body.type, mkv.body.remux, mkv.body.url], ["mp4", true, `/api/iptv/play/${mkv.body.token}/remux.mp4`]);
  const episode = await a("/iptv/lists/l1/play", { section: "series", id: "301", episodeId: "4002" });
  assert.equal(episode.status, 200, episode.text);
  assert.equal(episode.body.url, `/api/iptv/play/${episode.body.token}/remux.mp4`);
  assert.ok(![mp4, mkv, episode].some((r) => leaks(r.text)));

  const resource = await a("/iptv/resource?listId=l2");
  assert.deepEqual([resource.status, resource.body.error], [502, "Não foi possível carregar a lista."]);
  assert.ok(!/127\.0\.0\.1|privado/.test(resource.text), resource.text);
});

test.after(async () => {
  await sql.end();
  await control.unsafe(`drop schema ${schema} cascade`);
  await control.end();
});
