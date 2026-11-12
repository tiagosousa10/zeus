"use strict";
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.tiny-vps.com:6969/announce",
  "udp://explodie.org:6969/announce",
  "udp://tracker.dler.org:6969/announce",
  "udp://opentracker.i2p.rocks:6969/announce",
  "udp://udp.tracker.projectk.org:23333/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://tracker.moeking.me:6969/announce",
];
// Upload nunca perto de zero: o BitTorrent retribui quem partilha, e sem partilhar o download fica lento
const UP_AC = 2 * 1024 * 1024,
  UP_BATTERY = 512 * 1024;
const VIDEO_RE = /\.(mp4|m4v|webm|mov|mkv|avi|ogv|ts|m2ts)$/i;

function createTorrentService({ cacheDir, createClient, onRelease }) {
  const DL_DIR = cacheDir || path.join(os.tmpdir(), "zeus-cache");
  try {
    fs.rmSync(DL_DIR, { recursive: true, force: true });
  } catch {}
  fs.mkdirSync(DL_DIR, { recursive: true });
  let client = null;
  let batteryMode = false;
  let loadingClient = null;
  let clientGeneration = 0;
  async function getClient() {
    if (client) return client;
    if (loadingClient) return loadingClient;
    const generation = clientGeneration;
    const loading = Promise.resolve()
      .then(() =>
        createClient({
          maxConns: 50,
          uploadLimit: batteryMode ? UP_BATTERY : UP_AC,
        }),
      )
      .then((created) => {
        if (generation !== clientGeneration) {
          try {
            created.destroy();
          } catch {}
          throw new Error("Reprodução cancelada.");
        }
        client = created;
        client.on("error", (e) =>
          console.error("[engine] erro WebTorrent:", e && e.message),
        );
        // Battery state may change while the ESM graph loads.
        client.throttleUpload?.(batteryMode ? UP_BATTERY : UP_AC);
        return client;
      })
      .finally(() => {
        if (loadingClient === loading) loadingClient = null;
      });
    loadingClient = loading;
    return loading;
  }

  function releaseClient() {
    clientGeneration++;
    loadingClient = null;
    const previous = client;
    client = null;
    onRelease();
    if (!previous) return;
    for (const torrent of [...previous.torrents]) {
      try {
        torrent.destroy({ destroyStore: true });
      } catch {}
    }
    try {
      previous.destroy();
    } catch {}
  }
  function waitForMetadata(torrent, milliseconds, message) {
    if (torrent.destroyed)
      return Promise.reject(new Error("Reprodução cancelada."));
    if (torrent.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        torrent.removeListener("ready", ready);
        torrent.removeListener("error", failed);
        torrent.removeListener("close", closed);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = (error) => {
        cleanup();
        reject(error);
      };
      const closed = () => failed(new Error("Reprodução cancelada."));
      const timer = setTimeout(() => {
        failed(new Error(message));
        try {
          torrent.destroy({ destroyStore: true });
        } catch {}
      }, milliseconds);
      torrent.once("ready", ready);
      torrent.once("error", failed);
      torrent.once("close", closed);
    });
  }

  function pickFile(torrent, idx) {
    if (
      Number.isInteger(idx) &&
      torrent.files[idx] &&
      VIDEO_RE.test(torrent.files[idx].name)
    )
      return torrent.files[idx];
    const vids = torrent.files.filter((f) => VIDEO_RE.test(f.name));
    const pool = vids.length ? vids : torrent.files;
    return pool.reduce((a, b) => (a.length > b.length ? a : b), pool[0]);
  }

  async function startTorrent(magnet, fileIdx) {
    const c = await getClient();
    let torrent = c.get(magnet);
    if (torrent && typeof torrent.then === "function") torrent = await torrent;
    if (c !== client) throw new Error("Reprodução cancelada.");

    // Só um torrent ativo de cada vez: poupa disco, RAM e largura de banda
    for (const t of [...c.torrents]) {
      if (t !== torrent) {
        try {
          t.destroy({ destroyStore: true });
        } catch (e) {}
      }
    }
    if (!torrent) torrent = c.add(magnet, { path: DL_DIR, announce: TRACKERS });

    await waitForMetadata(
      torrent,
      90000,
      "Sem metadados ao fim de 90 s — o torrent não tem peers ativos.",
    );
    if (c !== client || torrent.destroyed)
      throw new Error("Reprodução cancelada.");

    const file = pickFile(torrent, fileIdx);
    if (!file) throw new Error("O torrent não tem ficheiros.");
    const idx = torrent.files.indexOf(file);
    // O WebTorrent seleciona o torrent inteiro por omissão (pack de temporada = descarrega tudo): remove essa seleção global
    try {
      torrent.deselect(0, torrent.pieces.length - 1, 0);
    } catch (e) {}
    torrent.files.forEach((f) => {
      if (f !== file) {
        try {
          f.deselect();
        } catch (e) {}
      }
    });
    file.select();
    return {
      ok: true,
      infoHash: torrent.infoHash,
      fileIdx: idx,
      name: file.name,
      length: file.length,
    };
  }

  // Pré-carrega só o início do ficheiro (episódio seguinte), sem mexer no que está a tocar
  async function preloadTorrent(magnet, fileIdx) {
    const c = await getClient();
    let torrent = c.get(magnet);
    if (torrent && typeof torrent.then === "function") torrent = await torrent;
    if (c !== client) throw new Error("Reprodução cancelada.");
    if (!torrent) torrent = c.add(magnet, { path: DL_DIR, announce: TRACKERS });
    await waitForMetadata(torrent, 60000, "timeout");
    if (c !== client || torrent.destroyed)
      throw new Error("Reprodução cancelada.");

    const file = pickFile(torrent, fileIdx);
    if (!file) return;
    try {
      torrent.deselect(0, torrent.pieces.length - 1, 0);
      const per = torrent.pieceLength || 262144;
      const s0 = file._startPiece;
      const e0 = Math.min(
        file._endPiece,
        s0 + Math.ceil((24 * 1024 * 1024) / per),
      );
      torrent.select(s0, e0, 0);
    } catch (e) {}
  }

  function dirSize(dir) {
    let total = 0;
    try {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, f.name);
        total += f.isDirectory() ? dirSize(fp) : fs.statSync(fp).size || 0;
      }
    } catch (e) {}
    return total;
  }

  function findFile(hash, idx) {
    if (!client) return null;
    const t = client.torrents.find((x) => x.infoHash === hash);
    if (!t || !t.files[idx]) return null;
    return { torrent: t, file: t.files[idx] };
  }

  return {
    start: startTorrent,
    preload: preloadTorrent,
    findFile,
    release: releaseClient,
    setBattery(on) {
      batteryMode = !!on;
      if (client) {
        try {
          client.throttleUpload(batteryMode ? UP_BATTERY : UP_AC);
        } catch {}
      }
    },
    status(hash, index) {
      const torrent = client?.torrents.find(
        (t) => !hash || t.infoHash === hash,
      );
      const file = torrent?.files[index];
      return {
        ok: true,
        active: !!torrent,
        infoHash: torrent?.infoHash ?? null,
        downloadSpeed: torrent?.downloadSpeed ?? 0,
        uploadSpeed: torrent?.uploadSpeed ?? 0,
        numPeers: torrent?.numPeers ?? 0,
        progress: file?.progress ?? torrent?.progress ?? 0,
        torrentProgress: torrent?.progress ?? 0,
        downloaded: torrent?.downloaded ?? 0,
        utp: !!client?.utp,
      };
    },
    cacheBytes: () => dirSize(DL_DIR),
    clear() {
      releaseClient();
      try {
        fs.rmSync(DL_DIR, { recursive: true, force: true });
        fs.mkdirSync(DL_DIR, { recursive: true });
      } catch {}
    },
    stop() {
      releaseClient();
      try {
        fs.rmSync(DL_DIR, { recursive: true, force: true });
      } catch {}
    },
  };
}
module.exports = { createTorrentService };
