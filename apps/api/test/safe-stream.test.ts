import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { safeFetch, safeStream } from "../src/lib/safe-fetch.js";

test("safeStream refuses private addresses and non-http schemes", async () => {
  await assert.rejects(safeStream("http://127.0.0.1:1/x"), /privado ou reservado/);
  await assert.rejects(safeStream("file:///etc/passwd"), /URL não permitido/);
  await assert.rejects(safeStream("http://user:pw@example.com/"), /URL não permitido/);
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
