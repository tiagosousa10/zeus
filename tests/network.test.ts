import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, safeFetch } from "../apps/api/src/lib/safe-fetch.ts";
test("outbound requests reject local, private, metadata and mapped addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "100.64.0.1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});
test("safe fetch rejects private targets and non-http schemes before sending", async () => {
  await assert.rejects(() => safeFetch("http://127.0.0.1:4310"));
  await assert.rejects(() => safeFetch("file:///etc/passwd"));
});
