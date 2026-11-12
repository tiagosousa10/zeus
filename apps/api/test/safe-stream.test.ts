import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import {
  safeFetch,
  safeStream,
  setAddressCheck,
} from "../src/lib/safe-fetch.js";

test("safeStream refuses private addresses and non-http schemes", async () => {
  await assert.rejects(
    safeStream("http://127.0.0.1:1/x"),
    /privado ou reservado/,
  );
  await assert.rejects(safeStream("file:///etc/passwd"), /URL não permitido/);
  await assert.rejects(
    safeStream("http://user:pw@example.com/"),
    /URL não permitido/,
  );
});

test("safeFetch keeps refusing private addresses", async () => {
  await assert.rejects(safeFetch("http://10.0.0.1/"), /privado ou reservado/);
});

test("safeStream rejects immediately when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    safeStream("http://8.8.8.8/x", { signal: controller.signal }),
    /cancelado/i,
  );
});

test("safeStream error messages never include the URL", async () => {
  await assert.rejects(
    safeStream("http://10.1.2.3/secret-path?token=abc"),
    (e: Error) => !/secret-path|token|10\.1\.2\.3/.test(e.message),
  );
});

const big = Buffer.alloc(3 * 1024 * 1024, 7);
let closed: Promise<void>;
let markClosed: () => void;
const server = http.createServer((req, res) => {
  if (req.url === "/big") {
    res.writeHead(200, {
      "content-type": "video/mp2t",
      "content-length": big.length,
    });
    res.end(big);
  } else if (req.url === "/forever") {
    closed = new Promise((r) => (markClosed = r));
    res.on("close", () => markClosed());
    res.writeHead(200, { "content-type": "video/mp2t" });
    res.write("x");
  } else if (req.url === "/slow") {
    res.writeHead(200);
    res.flushHeaders();
    let n = 0;
    const tick = setInterval(() => {
      res.write("a");
      if (++n === 3) {
        clearInterval(tick);
        res.end();
      }
    }, 200);
  } else if (req.url === "/hop") {
    res.writeHead(302, { location: "/dir/final" });
    res.end();
  } else if (req.url === "/dir/final") {
    res.writeHead(200);
    res.end("ok");
  } else if (req.url === "/304") {
    res.writeHead(304);
    res.end();
  } else if (req.url === "/205") {
    res.writeHead(205);
    res.end();
  } else {
    res.writeHead(404);
    res.end();
  }
});
let base = "";
before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const loopback = () => setAddressCheck(() => true);

test("safeStream streams a 3 MB body completely", async () => {
  const restore = loopback();
  try {
    const res = await safeStream(`${base}/big`);
    assert.equal(res.headers.get("content-length"), String(big.length));
    assert.equal((await res.arrayBuffer()).byteLength, big.length);
  } finally {
    restore();
  }
});

test("safeStream abort after headers closes upstream and fails the body read", async () => {
  const restore = loopback();
  try {
    const controller = new AbortController();
    const res = await safeStream(`${base}/forever`, {
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    await reader.read();
    controller.abort();
    await assert.rejects(reader.read());
    await closed;
  } finally {
    restore();
  }
});

test("safeStream timeout only covers the headers", async () => {
  const restore = loopback();
  try {
    const res = await safeStream(`${base}/slow`, { timeout: 100 });
    assert.equal((await res.text()).length, 3);
  } finally {
    restore();
  }
});

test("null-body statuses resolve without throwing", async () => {
  const restore = loopback();
  try {
    for (const status of [304, 205]) {
      const s = await safeStream(`${base}/${status}`);
      assert.equal(s.status, status);
      assert.equal(s.body, null);
      const f = await safeFetch(`${base}/${status}`);
      assert.equal(f.status, status);
      assert.equal(f.body, null);
    }
  } finally {
    restore();
  }
});

test("safeStream exposes the final URL after redirects", async () => {
  const restore = loopback();
  try {
    const res = await safeStream(`${base}/hop`);
    assert.equal(res.url, `${base}/dir/final`);
    assert.equal(await res.text(), "ok");
  } finally {
    restore();
  }
});
