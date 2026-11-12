import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once, EventEmitter } from "node:events";
const require = createRequire(import.meta.url);
const { startEngine } = require("../src/engine.js");
test("loading the idle Motor does not load WebTorrent", () => {
  assert.equal(
    Object.keys(require.cache).some((path) => path.includes("/webtorrent/")),
    false,
  );
});

test("stop cancels metadata waits, releases the client and starts a fresh client on demand", async () => {
  class Torrent extends EventEmitter {
    ready = false;
    destroyed = false;
    files = [];
    destroy() {
      this.destroyed = true;
      this.emit("close");
    }
  }
  class Client extends EventEmitter {
    torrents: Torrent[] = [];
    destroyed = false;
    get() {
      return undefined;
    }
    add() {
      const torrent = new Torrent();
      this.torrents.push(torrent);
      this.emit("added", torrent);
      return torrent;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const created: Client[] = [];
  const events = new EventEmitter();
  const dir = mkdtempSync(join(tmpdir(), "zeus-motor-lifecycle-"));
  const motor = startEngine({
    port: 0,
    cacheDir: dir,
    createClient: () => {
      const client = new Client();
      created.push(client);
      client.on("added", (torrent) => events.emit("added", torrent));
      return client;
    },
  });
  await once(motor.server, "listening");
  const url = `http://127.0.0.1:${motor.server.address().port}`;
  try {
    await fetch(url + "/status");
    assert.equal(created.length, 0);
    for (let i = 0; i < 2; i++) {
      const added = once(events, "added");
      const request = fetch(
        url + "/start?magnet=" + encodeURIComponent("magnet:?xt=urn:btih:test"),
      );
      const [torrent] = await added;
      assert.equal(created.length, i + 1);
      assert.equal((await fetch(url + "/stop")).status, 200);
      const response = await request;
      assert.equal(response.status, 504);
      assert.equal((await response.json()).error, "Reprodução cancelada.");
      assert.equal(created[i].destroyed, true);
      assert.equal(torrent.destroyed, true);
      for (const event of ["ready", "error", "close"])
        assert.equal(torrent.listenerCount(event), 0);
      torrent.emit("ready");
      assert.equal((await (await fetch(url + "/status")).json()).active, false);
    }
  } finally {
    motor.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("protected Motor rejects unauthenticated calls before mutations", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zeus-motor-test-"));
  const motor = startEngine({
    port: 0,
    token: "local-test-token",
    cacheDir: dir,
  });
  await once(motor.server, "listening");
  const url = `http://127.0.0.1:${motor.server.address().port}`;
  try {
    assert.equal((await fetch(url + "/clear")).status, 401);
    assert.equal((await fetch(url + "/status")).status, 401);
    assert.equal(
      (
        await fetch(url + "/status", {
          headers: { "X-Zeus-Motor-Token": "local-test-token" },
        })
      ).status,
      200,
    );
  } finally {
    motor.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stop during asynchronous client loading cancels the pending start and destroys the late client", async () => {
  let resolveClient!: (client: any) => void, factoryStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    factoryStarted = resolve;
  });
  const pending = new Promise<any>((resolve) => {
    resolveClient = resolve;
  });
  const client = Object.assign(new EventEmitter(), {
    torrents: [],
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
    get() {
      throw new Error("cancelled client must never be used");
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "zeus-motor-import-"));
  const motor = startEngine({
    port: 0,
    cacheDir: dir,
    createClient: () => {
      factoryStarted();
      return pending;
    },
  });
  await once(motor.server, "listening");
  const url = `http://127.0.0.1:${motor.server.address().port}`;
  try {
    const request = fetch(
      url + "/start?magnet=" + encodeURIComponent("magnet:?xt=urn:btih:test"),
    );
    await started;
    await fetch(url + "/stop");
    resolveClient(client);
    const result = await (await request).json();
    assert.equal(result.error, "Reprodução cancelada.");
    assert.equal(client.destroyed, true);
  } finally {
    motor.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "WebTorrent 3 serves a real locally seeded file through Motor with discovery disabled",
  { timeout: 15000 },
  async () => {
    const moduleName = "webtorrent";
    const { default: WebTorrent } = await import(moduleName);
    const bytes = Buffer.from(
      "local torrent fixture: no trackers, DHT, peers or Internet",
    );
    const real = new WebTorrent({
      dht: false,
      tracker: false,
      lsd: false,
      natUpnp: false,
      natPmp: false,
      utp: false,
    });
    const dir = mkdtempSync(join(tmpdir(), "zeus-motor-real-"));
    let motor: ReturnType<typeof startEngine> | undefined;
    try {
      const torrent = await new Promise<any>((resolve, reject) => {
        real.once("error", reject);
        real.seed(
          bytes,
          { name: "fixture.mp4", announce: [], private: true },
          resolve,
        );
      });
      motor = startEngine({
        port: 0,
        token: "offline-test",
        cacheDir: dir,
        createClient: async () => real,
      });
      await once(motor.server, "listening");
      const url = `http://127.0.0.1:${motor.server.address().port}`;
      const headers = { "X-Zeus-Motor-Token": "offline-test" };
      motor.setBattery(true);
      assert.equal(
        (
          await fetch(
            url + "/preload?magnet=" + encodeURIComponent(torrent.magnetURI),
            { headers },
          )
        ).status,
        200,
      );
      const started = await (
        await fetch(
          url + "/start?magnet=" + encodeURIComponent(torrent.magnetURI),
          { headers },
        )
      ).json();
      assert.equal(started.ok, true);
      assert.equal(started.name, "fixture.mp4");
      assert.equal(started.length, bytes.length);
      const response = await fetch(
        `${url}/stream/${started.infoHash}/${started.fileIdx}`,
        { headers: { ...headers, Range: "bytes=6-12" } },
      );
      assert.equal(response.status, 206);
      assert.equal(await response.text(), "torrent");
      motor.setBattery(false);
      await fetch(url + "/stop", { headers });
      assert.equal(real.destroyed, true);
      assert.equal(
        (await (await fetch(url + "/status", { headers })).json()).active,
        false,
      );
    } finally {
      motor?.stop();
      if (!real.destroyed)
        await new Promise<void>((resolve) => real.destroy(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("Motor native probes do not inherit authentication secrets", async () => {
  const { writeFileSync, readFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "zeus-probe-env-"));
  const output = join(dir, "environment");
  const executable = join(dir, "probe");
  writeFileSync(
    executable,
    `#!/bin/sh\nprintf '%s' "$BETTER_AUTH_SECRET" > '${output}'\n`,
    { mode: 0o700 },
  );
  const previous = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = "test-secret-must-not-reach-native-code";
  const motor = startEngine({
    port: 0,
    cacheDir: join(dir, "cache"),
    ffmpegPath: executable,
  });
  await once(motor.server, "listening");
  try {
    await fetch(
      `http://127.0.0.1:${motor.server.address().port}/tracks/test/0`,
    );
    assert.equal(readFileSync(output, "utf8"), "");
  } finally {
    motor.stop();
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
