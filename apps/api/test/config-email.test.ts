import { test } from "node:test";
import assert from "node:assert/strict";
import { configFields, validateConfig } from "../src/modules/addons/config.js";
import { streamEndpoint } from "../src/modules/addons/streams.js";
import { sendTransactionalEmail } from "../src/modules/email/service.js";
test("SDK configuration validates declared fields and encodes JSON without changing origin", () => {
  const fields = configFields([
    { key: "key", type: "password", required: true },
    { key: "count", type: "number" },
    { key: "enabled", type: "checkbox" },
    { key: "language", type: "select", options: ["pt", "en"] },
    { key: "__proto__", type: "text" },
  ]);
  assert.equal(fields.length, 4);
  assert.deepEqual(
    validateConfig(
      configFields([{ key: "checked", type: "checkbox", default: "checked" }]),
      {},
    ),
    {},
  );
  assert.throws(() => validateConfig(fields, {}), /Preenche/);
  assert.throws(
    () => validateConfig(fields, { key: "secret", language: "arbitrary" }),
    /Escolha/,
  );
  assert.throws(
    () => validateConfig(fields, { key: "secret", url: "https://evil.test" }),
    /não declarados/,
  );
  const config = validateConfig(fields, {
    key: "secret/with?delimiters",
    count: 3,
    enabled: true,
    language: "pt",
  });
  assert.deepEqual(config, {
    key: "secret/with?delimiters",
    count: "3",
    enabled: "on",
    language: "pt",
  });
  const url = new URL(
    streamEndpoint(
      "https://example.com/addon/manifest.json",
      config,
      "movie",
      "tt123",
      fields,
    ),
  );
  assert.equal(url.origin, "https://example.com");
  assert.equal(url.search, "");
  assert.deepEqual(
    JSON.parse(decodeURIComponent(url.pathname.split("/")[2])),
    config,
  );
});
test("Resend retries transient failures with stable idempotency and no real network", async () => {
  const beforeKey = process.env.RESEND_API_KEY,
    beforeFrom = process.env.RESEND_FROM;
  process.env.RESEND_API_KEY = "test";
  process.env.RESEND_FROM = "Zeus <test@example.test>";
  try {
    const keys: string[] = [];
    let attempts = 0;
    const mock = (async (_url: any, init: any) => {
      keys.push(new Headers(init.headers).get("Idempotency-Key")!);
      attempts++;
      return attempts === 1
        ? new Response("{}", { status: 503 })
        : Response.json({ id: "email-test" });
    }) as typeof fetch;
    const id = await sendTransactionalEmail(
      {
        to: "recipient@example.test",
        subject: "Convite",
        text: "Texto",
        idempotencyKey: "invite/one",
      },
      mock,
    );
    assert.equal(id, "email-test");
    assert.deepEqual(keys, ["invite/one", "invite/one"]);
    let failedAttempts = 0;
    await assert.rejects(() =>
      sendTransactionalEmail(
        {
          to: "recipient@example.test",
          subject: "Convite",
          text: "Texto",
          idempotencyKey: "invite/two",
        },
        (async () => {
          failedAttempts++;
          return new Response("{}", { status: 403 });
        }) as typeof fetch,
      ),
    );
    assert.equal(failedAttempts, 1);
  } finally {
    if (beforeKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = beforeKey;
    if (beforeFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = beforeFrom;
  }
});
