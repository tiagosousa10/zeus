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
