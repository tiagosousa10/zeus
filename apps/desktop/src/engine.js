"use strict";
const http = require("node:http");
const { timingSafeEqual } = require("node:crypto");
const { createTorrentService } = require("./services/torrent-service.js");
const { createMediaService } = require("./services/media-service.js");
const MIME = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  ogv: "video/ogg",
  ts: "video/mp2t",
  m2ts: "video/mp2t",
};

function startEngine({
  port = 11471,
  ffmpegPath = null,
  cacheDir,
  token = null,
  createClient = async (options) => {
    const { default: WebTorrent } = await import("webtorrent");
    return new WebTorrent(options);
  },
} = {}) {
  const media = createMediaService({
    ffmpegPath,
    token,
    getPort: () => port,
    findFile: (...args) => torrents.findFile(...args),
  });
  const torrents = createTorrentService({
    cacheDir,
    createClient,
    onRelease: () => media.stop(),
  });
  function cors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges",
    );
  }
  function json(res, code, obj) {
    cors(res);
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(obj));
  }

  function serveFile(req, res, file) {
    const total = file.length;
    let start = 0,
      end = total - 1,
      partial = false;
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        if (m[1] === "" && m[2] !== "") {
          start = Math.max(0, total - parseInt(m[2], 10));
        } else {
          if (m[1] !== "") start = parseInt(m[1], 10);
          if (m[2] !== "") end = Math.min(parseInt(m[2], 10), total - 1);
        }
        partial = true;
      }
      if (start > end || start >= total) {
        cors(res);
        res.writeHead(416, { "Content-Range": `bytes */${total}` });
        return res.end();
      }
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    cors(res);
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Cache-Control": "no-store",
    };
    if (partial) headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
    res.writeHead(partial ? 206 : 200, headers);
    if (req.method === "HEAD") return res.end();
    const stream = file.createReadStream({ start, end });
    stream.on("error", () => {
      try {
        res.destroy();
      } catch (e) {}
    });
    stream.pipe(res);
    res.on("close", () => stream.destroy());
  }

  function serveTranscode(req, res, hash, idx, startSec, audioN) {
    if (!ffmpegPath) {
      return json(res, 501, {
        ok: false,
        error: "ffmpeg não disponível nesta instalação.",
      });
    }
    cors(res);
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") return res.end();
    const ff = media.transcode(hash, idx, startSec, audioN);
    ff.on("error", (e) => {
      console.error("[ffmpeg] falhou:", e.message);
      try {
        res.destroy();
      } catch {}
    });
    ff.stdout.pipe(res);
    res.on("close", () => {
      try {
        ff.kill("SIGKILL");
      } catch (e) {}
    });
  }

  const server = http.createServer(async (req, res) => {
    if (token) {
      const supplied = Buffer.from(
        String(req.headers["x-zeus-motor-token"] || ""),
      );
      const expected = Buffer.from(token);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return json(res, 401, {
          ok: false,
          error: "Acesso ao Motor não autorizado.",
        });
    }
    let u;
    try {
      u = new URL(req.url, "http://127.0.0.1");
    } catch (e) {
      return json(res, 400, { ok: false });
    }
    const parts = u.pathname.split("/").filter(Boolean);

    if (req.method === "OPTIONS") {
      cors(res);
      res.writeHead(204);
      return res.end();
    }

    if (parts[0] === "keyframe" && parts.length >= 3) {
      const found = torrents.findFile(parts[1], parseInt(parts[2], 10));
      if (!found) return json(res, 404, { ok: false });
      const S = parseFloat(u.searchParams.get("t") || "0") || 0;
      const k = await media.probeKeyframe(parts[1], parseInt(parts[2], 10), S);
      return json(res, 200, { ok: true, t: k });
    }

    if (parts[0] === "status") {
      const hash = u.searchParams.get("hash");
      const index = parseInt(u.searchParams.get("fileIdx") || "-1", 10);
      return json(res, 200, {
        ...torrents.status(hash, index),
        ffmpeg: !!ffmpegPath,
      });
    }

    if (parts[0] === "stop") {
      torrents.release();
      return json(res, 200, { ok: true });
    }

    if (parts[0] === "preload") {
      const magnet = u.searchParams.get("magnet");
      if (!magnet || !/^magnet:\?/i.test(magnet))
        return json(res, 400, { ok: false });
      const fi = u.searchParams.get("fileIdx");
      torrents
        .preload(
          magnet,
          fi === null || fi === "" ? undefined : parseInt(fi, 10),
        )
        .catch(() => {});
      return json(res, 200, { ok: true });
    }

    if (parts[0] === "tracks" && parts.length >= 3) {
      const r = await media.probeTracks(parts[1], parseInt(parts[2], 10));
      return json(res, 200, r);
    }

    if (parts[0] === "cache") {
      return json(res, 200, { ok: true, bytes: torrents.cacheBytes() });
    }

    if (parts[0] === "clear") {
      torrents.clear();
      return json(res, 200, { ok: true });
    }

    if (parts[0] === "start") {
      const magnet = u.searchParams.get("magnet");
      if (!magnet || !/^magnet:\?/i.test(magnet))
        return json(res, 400, { ok: false, error: "Magnet inválido." });
      const fi = u.searchParams.get("fileIdx");
      try {
        const info = await torrents.start(
          magnet,
          fi === null || fi === "" ? undefined : parseInt(fi, 10),
        );
        return json(res, 200, info);
      } catch (e) {
        return json(res, 504, {
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      }
    }

    if (
      (parts[0] === "stream" || parts[0] === "transcode") &&
      parts.length >= 3
    ) {
      const found = torrents.findFile(parts[1], parseInt(parts[2], 10));
      if (!found)
        return json(res, 404, { ok: false, error: "Torrent não está ativo." });
      if (parts[0] === "stream") return serveFile(req, res, found.file);
      return serveTranscode(
        req,
        res,
        parts[1],
        parseInt(parts[2], 10),
        parseFloat(u.searchParams.get("start") || "0") || 0,
        parseInt(u.searchParams.get("audio") || "0", 10) || 0,
      );
    }

    json(res, 200, { ok: true, engine: "Zeus Motor" });
  });

  server.on("error", (e) => console.error("[engine] servidor:", e.message));
  server.listen(port, "127.0.0.1", () => {
    port = server.address().port;
  });
  return {
    port,
    server,
    setBattery: torrents.setBattery,
    stop() {
      try {
        server.close();
      } catch {}
      torrents.stop();
    },
  };
}
module.exports = { startEngine };
