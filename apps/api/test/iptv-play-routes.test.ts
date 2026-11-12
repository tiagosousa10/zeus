import test from "node:test";
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { fakeFetch, xtreamRoutes } from "./fixtures/xtream.js";
import { fakeUpstream, type FakeResource } from "./fixtures/upstream.js";
import { normalizeM3U } from "../src/modules/iptv/services/m3u.js";
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM;
delete process.env.TURNSTILE_SECRET_KEY;
process.env.ZEUS_DATA_DIR = mkdtempSync(join(tmpdir(), "zeus-iptv-play-"));
delete process.env.DATABASE_URL;
process.env.ZEUS_DATABASE_PATH = join(
  process.env.ZEUS_DATA_DIR!,
  "test.sqlite",
);
process.env.ZEUS_WEB_ORIGIN = "http://127.0.0.1:5174";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:5174";
const { closeDatabase } = await import("../src/db/client.js");
const { app } = await import("../src/app.js");
const { setProviderFetch } =
  await import("../src/modules/iptv/services/provider.js");
const { findSession, setSessionClock } =
  await import("../src/modules/iptv/services/sessions.js");
const { setUpstreamFetch } =
  await import("../src/modules/iptv/services/playback.js");
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
  const raw = (
    path: string,
    init: {
      body?: any;
      method?: string;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    } = {},
  ) =>
    app.request(`http://127.0.0.1:5174/api${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      signal: init.signal,
      headers: {
        origin: "http://127.0.0.1:5174",
        "content-type": "application/json",
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...init.headers,
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  const call = async (
    path: string,
    body?: any,
    method = body ? "POST" : "GET",
  ) => {
    const response = await raw(path, { body, method });
    for (const c of response.headers.getSetCookie()) {
      const pair = c.split(";")[0],
        i = pair.indexOf("=");
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await response.text();
    const json = response.headers.get("content-type")?.includes("json");
    return {
      status: response.status,
      body: json ? JSON.parse(text) : undefined,
      text,
      type: response.headers.get("content-type"),
    };
  };
  return Object.assign(call, { raw });
}

async function verify(c: ReturnType<typeof client>, password: string) {
  const setup = await c("/auth/two-factor/enable", { password });
  assert.equal(setup.status, 200, setup.text);
  const secret = new URL(setup.body.totpURI).searchParams.get("secret")!;
  assert.equal(
    (await c("/auth/two-factor/verify-totp", { code: totp(secret) })).status,
    200,
  );
}

const ORIGIN = "https://tv.example.test/live/u/segredo-123";
const EDGE = "https://edge.cdn.test/hls/u/segredo-123/101";
const M3U_URL =
  "https://m3u.example.test/get.php?username=fulano-m3u&password=chave-m3u-99&token=tok3n-m3u-1&type=m3u_plus";
const M3U_TEXT =
  '#EXTM3U\n#EXTINF:-1 group-title="Notícias",Canal M3U\nhttps://stream.m3u.test/hls/chan.m3u8\n#EXTINF:-1 group-title="Notícias",Canal TS\nhttps://stream.m3u.test/live.ts\n';
const KEY = new Uint8Array([
  0x9a, 0x01, 0xff, 0x10, 0x22, 0x7e, 0x00, 0x41, 0xc3, 0x28, 0x80, 0x0f, 0x5c,
  0x2f, 0x2f, 0x68,
]);
const TS = new Uint8Array([
  0x47, 0x40, 0x11, 0x10, 0x00, 0x42, 0xf0, 0x25, 0x00, 0x01, 0xc1, 0x00, 0x00,
  0xff, 0x01, 0xff,
]);
const NO_CONTROL = new Uint8Array([
  0xc3, 0x28, 0xa0, 0xa1, 0xe2, 0x28, 0xa1, 0x41, 0xf0, 0x90, 0x28, 0xbc, 0xfe,
  0xfe, 0xff, 0xff,
]);
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
  [`${EDGE}/low/split`]: {
    headers: { "content-type": "text/plain" },
    body: [
      "#EXT",
      "M3U\n#EXTINF:6.0,\nhttps://cdn.test/segredo-123/split1.ts\n",
    ],
  },
  [`${EDGE}/low/blank`]: {
    body: [
      "\uFEFF \n",
      "#EXTM3U\n#EXTINF:6.0,\nhttps://cdn.test/segredo-123/blank1.ts\n",
    ],
  },
  [`${EDGE}/low/ranged`]: {
    status: 206,
    headers: { "content-type": "text/plain", "content-range": "bytes 1-60/61" },
    body: "EXTM3U\n#EXTINF:6.0,\nhttps://cdn.test/segredo-123/ranged1.ts\n",
  },
  [`${EDGE}/low/json`]: {
    headers: { "content-type": "application/json" },
    body: '{"next":"https://cdn.test/segredo-123/x.ts"}',
  },
  [`${EDGE}/low/html`]: {
    headers: { "content-type": "text/html" },
    body: "<a href=https://cdn.test/x>x</a>",
  },
  [`${EDGE}/low/spaces`]: {
    headers: { "content-type": "text/plain" },
    body: [" ".repeat(70 * 1024), "#EXTM3U\nhttps://cdn.test/x.ts\n"],
  },
  [`${EDGE}/low/sub.vtt`]: {
    headers: { "content-type": "text/vtt" },
    body: "WEBVTT\n\n00:00.000 --> 00:01.000\nOlá\n",
  },
  [`${EDGE}/low/odd`]: {
    headers: { "content-type": "text/plain" },
    body: "\uFEFF \n#EXTM3U\n#EXTINF:6.0,\nhttps://cdn.test/segredo-123/odd1.ts\n",
  },
  [`${EDGE}/low/index.m3u8`]: {
    body: "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg1.ts\n#EXTINF:6.0,\nhttps://cdn.test/segredo-123/seg2.ts\n#EXTINF:6.0,\nodd\n#EXTINF:6.0,\nsplit\n#EXTINF:6.0,\nblank\n#EXTINF:6.0,\nranged\n#EXTINF:6.0,\njson\n#EXTINF:6.0,\nhtml\n#EXTINF:6.0,\nspaces\n#EXTINF:6.0,\nsub.vtt\n#EXTINF:6.0,\nkey\n#EXTINF:6.0,\nts\n#EXTINF:6.0,\nraw\n",
  },
  [`${EDGE}/low/key`]: { headers: { "content-type": "text/html" }, body: KEY },
  [`${EDGE}/low/ts`]: { headers: { "content-type": "text/plain" }, body: TS },
  [`${EDGE}/low/raw`]: {
    headers: { "content-type": "application/json" },
    body: NO_CONTROL,
  },
  [`${EDGE}/low/seg1.ts`]: {
    headers: { "content-type": "video/mp2t" },
    body: "SEGMENT-1",
    open: true,
  },
  ...Object.fromEntries(
    ["avc1x", "vc1.64"].map((p) => [
      `https://tv.example.test/live/u/${p}/101.m3u8`,
      {
        body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS="avc1.64001f,mp4a.40.2"\nv.m3u8\n',
      },
    ]),
  ),
  "https://tv.example.test/live/654321/123456/101.m3u8": {
    body: "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:123456\n#EXT-X-DISCONTINUITY-SEQUENCE:654321\n#EXTINF:6,\ns.ts\n",
  },
  "https://stream.m3u.test/hls/chan.m3u8": { body: "#EXTM3U\n" },
  [`${ORIGIN}/102.m3u8`]: {
    status: 509,
    body: "max connections https://tv.example.test",
  },
};
const links = (text: string) =>
  text.split("\n").filter((l) => l.startsWith("/api/iptv/play/"));
const leaks = (text: string) =>
  /segredo-123|tv\.example\.test|cdn\.test/.test(text);

test("playback starts through the API and HLS never reveals the provider", async () => {
  const a = client();
  const password = "test-password-very-long";
  const boot = await a("/bootstrap", {
    name: "Admin Test",
    email: "admin@example.test",
    password,
  });
  assert.equal(boot.status, 200, boot.text);
  await verify(a, password);
  const invitation = await a("/admin/invites", {
    email: "member@example.test",
  });
  assert.equal(invitation.status, 201, invitation.text);
  const b = client();
  const invite = new URL(invitation.body.url).searchParams.get("invite");
  assert.equal(
    (await b("/invites/accept", { token: invite, name: "Member", password }))
      .status,
    200,
  );
  await verify(b, password);

  const list = {
    id: "l1",
    name: "Casa",
    type: "xtream",
    url: "https://tv.example.test/",
    username: "u",
    password: "segredo-123",
  };
  const local = {
    id: "l2",
    name: "Local",
    type: "m3u",
    url: "http://127.0.0.1/",
  };
  const short = {
    id: "l3",
    name: "Curta",
    type: "xtream",
    url: "https://tv.example.test/",
    username: "u",
    password: "avc1x",
  };
  const inner = { ...short, id: "l4", password: "vc1.64" };
  const digits = { ...short, id: "l5", username: "654321", password: "123456" };
  const m3u = { id: "l6", name: "M3U", type: "m3u", url: M3U_URL };
  assert.equal(
    (
      await a(
        "/state",
        { iptv: [list, local, short, inner, digits, m3u] },
        "PATCH",
      )
    ).status,
    200,
  );
  setProviderFetch(
    fakeFetch((u) =>
      u.hostname === "m3u.example.test"
        ? new Response(M3U_TEXT)
        : xtreamRoutes(u),
    ),
  );
  const fake = fakeUpstream(upstream);
  setUpstreamFetch(fake);

  assert.equal(
    (await a("/iptv/lists/l1/play", { section: "series", id: "301" })).status,
    400,
  );
  const publicLists = (await a("/state")).body.iptv;
  assert.ok(
    publicLists.every((l: any) => !l.url && !l.password && !l.username),
  );
  assert.equal(
    (
      await a(
        "/state",
        {
          iptv: publicLists.map((l: any) => ({
            ...l,
            name: l.name + " edited",
          })),
        },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.deepEqual((await b("/state")).body.iptv, []);
  assert.equal(
    (await b("/state", { iptv: [publicLists[0]] }, "PATCH")).status,
    400,
  );
  assert.deepEqual((await b("/state")).body.iptv, []);
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
  assert.match(
    variantLink,
    new RegExp(`^/api/iptv/play/${play.body.token}/r/\\w+$`),
  );

  const adult = await a("/iptv/lists/l1/play", { section: "live", id: "104" });
  assert.deepEqual(
    [adult.status, adult.body.error],
    [404, "Este conteúdo não está disponível."],
  );
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
  assert.equal(links(media.text).length, 13);
  for (const i of [2, 3, 4]) {
    const sniffed = await a(links(media.text)[i].slice(4));
    assert.equal(
      sniffed.type,
      "application/vnd.apple.mpegurl",
      `link ${i}: ${sniffed.text}`,
    );
    assert.equal(links(sniffed.text).length, 1);
    assert.ok(!leaks(sniffed.text), sniffed.text);
  }
  const ranged = await a.raw(links(media.text)[5].slice(4), {
    headers: { range: "bytes=1-" },
  });
  const rangedText = await ranged.text();
  assert.deepEqual(
    [ranged.status, JSON.parse(rangedText).error],
    [502, "O fornecedor não respondeu. Tenta de novo."],
  );
  assert.ok(!leaks(rangedText));
  for (const i of [6, 7, 8]) {
    const textual = await a(links(media.text)[i].slice(4));
    assert.deepEqual(
      [textual.status, textual.body?.error],
      [502, "O fornecedor não respondeu. Tenta de novo."],
      `link ${i}`,
    );
    assert.ok(!leaks(textual.text));
  }
  const vtt = await a(links(media.text)[9].slice(4));
  assert.deepEqual(
    [vtt.status, vtt.type, vtt.text],
    [200, "text/vtt", "WEBVTT\n\n00:00.000 --> 00:01.000\nOlá\n"],
  );
  // Binary keys and segments mislabelled as text still play.
  for (const [i, bytes] of [
    [10, KEY],
    [11, TS],
    [12, NO_CONTROL],
  ] as const) {
    const binary = await a.raw(links(media.text)[i].slice(4));
    assert.equal(binary.status, 200, `link ${i}`);
    assert.equal(
      binary.headers.get("content-type"),
      "application/octet-stream",
    );
    assert.equal(binary.headers.get("x-content-type-options"), "nosniff");
    assert.equal(binary.headers.get("content-security-policy"), "sandbox");
    assert.deepEqual(new Uint8Array(await binary.arrayBuffer()), bytes);
  }

  const segment = await a.raw(links(media.text)[0].slice(4), {
    headers: { range: "bytes=0-" },
  });
  assert.equal(segment.status, 200);
  assert.equal(segment.headers.get("content-type"), "video/mp2t");
  assert.equal(segment.headers.get("x-content-type-options"), "nosniff");
  assert.equal(segment.headers.get("content-security-policy"), "sandbox");
  const reader = segment.body!.getReader();
  assert.equal(
    new TextDecoder().decode((await reader.read()).value),
    "SEGMENT-1",
  );
  const segmentCall = fake.calls.find((c) => c.url === `${EDGE}/low/seg1.ts`)!;
  assert.equal(segmentCall.headers?.range, "bytes=0-");
  assert.equal(segmentCall.signal?.aborted, false);

  assert.equal((await b(play.body.url.slice(4))).status, 404);
  assert.equal((await a("/iptv/play/nope/index.m3u8")).status, 404);

  assert.equal(
    (await b(`/iptv/play/${play.body.token}/stop`, {}, "POST")).status,
    404,
  );
  assert.notEqual(findSession(play.body.token, "wrong-member"), "ended");
  const second = await a("/iptv/lists/l1/play", { section: "live", id: "102" });
  assert.equal(second.status, 200, second.text);
  const ended = await a(play.body.url.slice(4));
  assert.deepEqual(
    [ended.status, ended.body.error],
    [410, "Esta reprodução terminou."],
  );
  assert.equal(segmentCall.signal?.aborted, true);
  await assert.rejects(reader.read());

  const limited = await a(second.body.url.slice(4));
  assert.equal(limited.status, 502);
  assert.match(
    limited.body.error,
    /já está a ser usada noutro aparelho \(máximo de 1 ligação\(ões\)\)/,
  );
  assert.ok(!leaks(limited.text));

  upstream[`${ORIGIN}/102.m3u8`].status = 500;
  const down = await a(second.body.url.slice(4));
  assert.deepEqual(
    [down.status, down.body.error],
    [502, "O fornecedor não respondeu. Tenta de novo."],
  );

  Object.assign(upstream[`${ORIGIN}/102.m3u8`], {
    status: 200,
    body: "#EXTM3U\n" + "#".repeat(2 * 1024 * 1024),
  });
  const huge = await a(second.body.url.slice(4));
  assert.deepEqual(
    [huge.status, huge.body.error],
    [502, "O fornecedor não respondeu. Tenta de novo."],
  );

  for (const name of ["u segredo-123", "TV.Example.Test"]) {
    upstream[`${ORIGIN}/102.m3u8`].body =
      `#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="${name}",URI="a.m3u8"\n`;
    const secret = await a(second.body.url.slice(4));
    assert.deepEqual(
      [secret.status, secret.body?.error],
      [502, "O fornecedor não respondeu. Tenta de novo."],
      name,
    );
    assert.ok(!leaks(secret.text) && !/example/i.test(secret.text));
  }
  upstream[`${ORIGIN}/102.m3u8`].body =
    "#EXTM3U\n#EXTINF:6,u segredo-123\nseg.ts\n";
  const titled = await a(second.body.url.slice(4));
  assert.equal(titled.status, 200, titled.text);
  assert.ok(!leaks(titled.text), titled.text);
  // The host reached after redirects is a secret too.
  Object.assign(upstream[`${ORIGIN}/102.m3u8`], {
    url: "https://edge2.relay.test/x/102.m3u8",
    body: '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Edge2.Relay.Test",URI="a.m3u8"\n',
  });
  const redirected = await a(second.body.url.slice(4));
  assert.deepEqual(
    [redirected.status, redirected.body?.error],
    [502, "O fornecedor não respondeu. Tenta de novo."],
  );
  assert.ok(!/relay/i.test(redirected.text));

  assert.equal(
    (await a(`/iptv/play/${second.body.token}/stop`, {}, "POST")).status,
    200,
  );
  assert.equal(
    (await a(`/iptv/play/${play.body.token}/stop`, {}, "POST")).status,
    200,
  );
  const activeAfterStop = await a("/iptv/lists/l1/play", {
    section: "live",
    id: "101",
  });
  await a(`/iptv/play/${second.body.token}/stop`, {}, "POST");
  assert.equal(
    (await a(activeAfterStop.body.url.replace(/^\/api/, ""))).status,
    200,
  );
  const mp4 = await a("/iptv/lists/l1/play", { section: "movie", id: "201" });
  assert.deepEqual(
    [mp4.body.type, mp4.body.remux, mp4.body.url],
    ["mp4", false, `/api/iptv/play/${mp4.body.token}/file`],
  );
  upstream["https://tv.example.test/movie/u/segredo-123/201.mp4"] = {
    status: 206,
    headers: {
      "content-range": "bytes 0-99/1000",
      "content-length": "100",
      "accept-ranges": "bytes",
    },
    body: new Uint8Array(100),
  };
  const partial = await a.raw(mp4.body.url.slice(4), {
    headers: { range: "bytes=0-99" },
  });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 0-99/1000");
  assert.equal(partial.headers.get("content-type"), "video/mp4");
  assert.equal(partial.headers.get("cache-control"), "no-store");
  assert.equal((await partial.arrayBuffer()).byteLength, 100);
  assert.equal(fake.calls.at(-1)?.headers?.range, "bytes=0-99");
  const mkv = await a("/iptv/lists/l1/play", { section: "movie", id: "202" });
  assert.deepEqual(
    [mkv.body.type, mkv.body.remux, mkv.body.url],
    ["mp4", true, `/api/iptv/play/${mkv.body.token}/remux.mp4`],
  );
  const mkvBytes = execFileSync(ffmpeg!, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=2:size=160x120:rate=10",
    "-f",
    "lavfi",
    "-i",
    "sine=duration=2",
    "-c:v",
    "mpeg4",
    "-c:a",
    "ac3",
    "-f",
    "matroska",
    "pipe:1",
  ]);
  upstream["https://tv.example.test/movie/u/segredo-123/202.mkv"] = {
    body: mkvBytes,
  };
  // A second request must be rejected while the first converter is still waiting
  // for media, not merely once it has sent response headers.
  const pendingAbort = new AbortController();
  const repeatAbort = new AbortController();
  const mediaUrl = "https://tv.example.test/movie/u/segredo-123/202.mkv";
  upstream[mediaUrl] = { body: new Uint8Array(), open: true };
  const pending = a.raw(mkv.body.url.slice(4), { signal: pendingAbort.signal });
  try {
    for (
      let i = 0;
      i < 100 && !fake.calls.some((call) => call.url === mediaUrl);
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    const repeat = a.raw(mkv.body.url.slice(4), { signal: repeatAbort.signal });
    const timer = setTimeout(() => repeatAbort.abort(), 2000);
    try {
      assert.equal((await repeat).status, 429);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    pendingAbort.abort();
    repeatAbort.abort();
    await pending;
    upstream[mediaUrl] = { body: mkvBytes };
  }
  for (const status of [509, 500]) {
    upstream["https://tv.example.test/movie/u/segredo-123/202.mkv"].status =
      status;
    const failure = await a(mkv.body.url.slice(4));
    assert.equal(failure.status, 502);
    assert.match(
      failure.body.error,
      status === 509
        ? /já está a ser usada noutro aparelho/
        : /O fornecedor não respondeu/,
    );
  }
  upstream["https://tv.example.test/movie/u/segredo-123/202.mkv"].status = 200;
  for (const t of [0, 1]) {
    const output = await a.raw(`${mkv.body.url.slice(4)}?t=${t}`);
    assert.equal(output.status, 200);
    assert.equal(output.headers.get("content-type"), "video/mp4");
    assert.equal(output.headers.get("cache-control"), "no-store");
    assert.equal(
      Buffer.from(await output.arrayBuffer())
        .subarray(4, 8)
        .toString(),
      "ftyp",
    );
  }
  assert.equal((await a(`${mkv.body.url.slice(4)}?t=-1`)).status, 400);
  // A slow series metadata request must never supersede a newer live start.
  let releaseMetadata!: () => void;
  let metadataEntered!: () => void;
  const metadataGate = new Promise<void>((resolve) => {
    releaseMetadata = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    metadataEntered = resolve;
  });
  const fixtureProvider = fakeFetch((u) =>
    u.hostname === "m3u.example.test"
      ? new Response(M3U_TEXT)
      : xtreamRoutes(u),
  );
  setProviderFetch(async (input, options) => {
    if (new URL(input).searchParams.get("action") === "get_series_info") {
      metadataEntered();
      await metadataGate;
    }
    return fixtureProvider(input, options);
  });
  const older = a("/iptv/lists/l1/play", {
    section: "series",
    id: "301",
    episodeId: "4001",
  });
  await entered;
  const newer = await a("/iptv/lists/l1/play", { section: "live", id: "101" });
  releaseMetadata();
  assert.equal((await older).status, 409);
  assert.equal((await a(newer.body.url.replace(/^\/api/, ""))).status, 200);
  setProviderFetch(fixtureProvider);
  const episode = await a("/iptv/lists/l1/play", {
    section: "series",
    id: "301",
    episodeId: "4002",
  });
  assert.equal(episode.status, 200, episode.text);
  assert.equal(
    episode.body.url,
    `/api/iptv/play/${episode.body.token}/remux.mp4`,
  );
  assert.ok(![mp4, mkv, episode].some((r) => leaks(r.text)));

  // Credentials count only when 6+ characters long and as whole tokens, so they never collide with CODECS.
  for (const id of ["l3", "l4"]) {
    const started = await a(`/iptv/lists/${id}/play`, {
      section: "live",
      id: "101",
    });
    const codecs = await a(started.body.url.slice(4));
    assert.equal(codecs.status, 200, `${id}: ${codecs.text}`);
    assert.match(codecs.text, /CODECS="avc1\.64001f,mp4a\.40\.2"/);
  }

  // All-digit credentials collide with numeric attributes, so only the hosts guard them.
  const numeric = await a("/iptv/lists/l5/play", {
    section: "live",
    id: "101",
  });
  const sequence = await a(numeric.body.url.slice(4));
  assert.equal(sequence.status, 200, sequence.text);
  assert.match(
    sequence.text,
    /#EXT-X-MEDIA-SEQUENCE:123456\n#EXT-X-DISCONTINUITY-SEQUENCE:654321/,
  );

  // M3U lists carry credentials in their URL query.
  const channel = normalizeM3U(M3U_TEXT, M3U_URL, 0).live.items[0].id;
  const fromM3U = await a("/iptv/lists/l6/play", {
    section: "live",
    id: channel,
  });
  assert.equal(fromM3U.status, 200, fromM3U.text);
  assert.equal((await a(fromM3U.body.url.slice(4))).status, 200);
  for (const value of ["fulano-m3u", "chave-m3u-99", "tok3n-m3u-1"]) {
    upstream["https://stream.m3u.test/hls/chan.m3u8"].body =
      `#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="x ${value}",URI="a.m3u8"\n`;
    const secret = await a(fromM3U.body.url.slice(4));
    assert.deepEqual(
      [secret.status, secret.body?.error],
      [502, "O fornecedor não respondeu. Tenta de novo."],
      value,
    );
  }

  const tsId = normalizeM3U(M3U_TEXT, M3U_URL, 0).live.items.find((c) =>
    c.source?.endsWith("live.ts"),
  )!.id;
  upstream["https://stream.m3u.test/live.ts"] = { body: TS, open: true };
  const live = await a("/iptv/lists/l6/play", { section: "live", id: tsId });
  assert.equal(live.body.type, "mpegts");
  const abort = new AbortController();
  const transport = await a.raw(live.body.url.slice(4), {
    signal: abort.signal,
    headers: { range: "bytes=0-99" },
  });
  assert.equal(transport.status, 200);
  assert.equal(transport.headers.get("content-type"), "video/mp2t");
  assert.equal(transport.headers.get("cache-control"), "no-store");
  assert.equal(fake.calls.at(-1)?.headers?.range, undefined);
  const transportReader = transport.body!.getReader();
  assert.deepEqual((await transportReader.read()).value, TS);
  const transportCall = fake.calls.at(-1)!;
  abort.abort();
  assert.equal(transportCall.signal?.aborted, true);
  await assert.rejects(transportReader.read());
  await a("/iptv/lists/l6/play", { section: "live", id: channel });
  assert.equal((await a(live.body.url.slice(4))).status, 410);

  // A live stream that continues delivering data stays usable beyond the two-hour idle timeout.
  let push!: ReadableStreamDefaultController<Uint8Array>;
  setUpstreamFetch(
    async (_url, options) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            push = controller;
            options?.signal?.addEventListener(
              "abort",
              () => controller.error(new Error("cancelled")),
              { once: true },
            );
          },
        }),
      ),
  );
  const longPlay = await a("/iptv/lists/l6/play", {
    section: "live",
    id: tsId,
  });
  const longAbort = new AbortController();
  const longResponse = await a.raw(longPlay.body.url.slice(4), {
    signal: longAbort.signal,
  });
  const longReader = longResponse.body!.getReader();
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  setSessionClock(() => now);
  try {
    for (let minute = 0; minute < 181; minute++) {
      now += 60_000;
      push.enqueue(TS);
      await longReader.read();
    }
    // Read the owner from the authenticated bootstrap result rather than guessing the stored id.
    const stillPlaying = findSession(longPlay.body.token, boot.body.user.id);
    assert.ok(stillPlaying && stillPlaying !== "ended");
  } finally {
    Date.now = realNow;
    setSessionClock(realNow);
    longAbort.abort();
    await longReader.cancel().catch(() => {});
    setUpstreamFetch(fake);
  }

  const resource = await a("/iptv/resource?listId=l2");
  assert.equal(resource.status, 404);
  assert.ok(!/127\.0\.0\.1|privado/.test(resource.text), resource.text);
});

test.after(async () => {
  await closeDatabase();
});
