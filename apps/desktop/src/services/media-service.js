"use strict";
const { spawn } = require("node:child_process");
const {
  nativeEnvironment,
} = require("../../../../packages/local-config/process-env.cjs");
function createMediaService({ ffmpegPath, token, getPort, findFile }) {
  const probes = new Set();
  function spawnProbe(command, args, options) {
    const process = spawn(command, args, {
      ...options,
      env: nativeEnvironment(),
    });
    probes.add(process);
    process.once("close", () => probes.delete(process));
    return process;
  }
  // Lê o cabeçalho com o ffmpeg: duração e faixas de áudio
  const tracksCache = {};
  function probeTracks(hash, idx) {
    const key = hash + ":" + idx;
    if (tracksCache[key]) return Promise.resolve(tracksCache[key]);
    return new Promise((resolve) => {
      if (!ffmpegPath)
        return resolve({ ok: false, error: "ffmpeg não disponível." });
      let err = "";
      const ff = spawnProbe(
        ffmpegPath,
        [
          "-hide_banner",
          ...(token ? ["-headers", `X-Zeus-Motor-Token: ${token}\r\n`] : []),
          "-i",
          `http://127.0.0.1:${getPort()}/stream/${hash}/${idx}`,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      const to = setTimeout(() => {
        try {
          ff.kill("SIGKILL");
        } catch (e) {}
      }, 30000);
      ff.stderr.on("data", (d) => {
        err += d;
        if (err.length > 80000) {
          try {
            ff.kill("SIGKILL");
          } catch (e) {}
        }
      });
      ff.on("error", () => {
        clearTimeout(to);
        resolve({ ok: false });
      });
      ff.on("close", () => {
        clearTimeout(to);
        const dm = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
        const duration = dm
          ? +dm[1] * 3600 + +dm[2] * 60 + parseFloat(dm[3])
          : 0;
        const audio = [];
        let video = "";
        err.split(/\n(?=\s+Stream #)/).forEach((block) => {
          const head = block.split("\n")[0];
          const vm = /Stream #\d+:\d+[^:]*: Video: (\w+)/.exec(head);
          if (vm && !video) video = vm[1];
          const am =
            /Stream #\d+:\d+(?:\((\w+)\))?[^:]*: Audio: (\w+)[^,]*, (\d+) Hz, ([^,]+)/.exec(
              head,
            );
          if (am) {
            const tm = /title\s*:\s*(.+)/.exec(block);
            audio.push({
              n: audio.length,
              lang: am[1] || "und",
              codec: am[2],
              ch: am[4].replace(/\(.*\)/, "").trim(),
              title: tm ? tm[1].trim() : "",
              def: /\(default\)/.test(head),
            });
          }
        });
        const out = {
          ok: duration > 0 || audio.length > 0,
          duration,
          audio,
          video,
        };
        if (out.ok && findFile(hash, idx)) {
          if (Object.keys(tracksCache).length >= 32)
            delete tracksCache[Object.keys(tracksCache)[0]];
          tracksCache[key] = out;
        }
        resolve(out);
      });
    });
  }

  // Modo compatibilidade: copia o vídeo e converte o áudio (AC3/DTS/EAC3...) para AAC em MP4 fragmentado
  // Descobre o keyframe real onde o ffmpeg (copy) vai começar para pedido -ss S
  function probeKeyframe(hash, idx, startSec) {
    return new Promise((resolve) => {
      if (!ffmpegPath || !(startSec > 0))
        return resolve(startSec > 0 ? startSec : 0);
      const ff = spawnProbe(
        ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "debug",
          "-debug_ts",
          "-ss",
          String(startSec),
          "-noaccurate_seek",
          ...(token ? ["-headers", `X-Zeus-Motor-Token: ${token}\r\n`] : []),
          "-i",
          `http://127.0.0.1:${getPort()}/stream/${hash}/${idx}`,
          "-map",
          "0:v:0",
          "-c",
          "copy",
          "-frames:v",
          "1",
          "-f",
          "null",
          "-",
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let buf = "",
        done = false;
      const fin = (v) => {
        if (done) return;
        done = true;
        clearTimeout(to);
        try {
          ff.kill("SIGKILL");
        } catch (e) {}
        resolve(v);
      };
      const to = setTimeout(() => fin(startSec), 20000);
      ff.stderr.on("data", (d) => {
        buf += String(d);
        const m =
          /demuxer\s*->\s*ist_index:\d+[^\n]*?type:video[^\n]*?pkt_pts_time:(-?[\d.]+)/.exec(
            buf,
          ) ||
          /demuxer\s*->\s*ist_index:\d+[^\n]*?type:video[^\n]*?pkt_dts_time:(-?[\d.]+)/.exec(
            buf,
          );
        if (m) {
          const k = parseFloat(m[1]);
          fin(isFinite(k) && k >= 0 && k <= startSec + 1 ? k : startSec);
        }
        if (buf.length > 400000) buf = buf.slice(-100000);
      });
      ff.on("close", () => fin(startSec));
      ff.on("error", () => fin(startSec));
    });
  }

  function transcode(hash, idx, startSec, audioN) {
    const args = ["-hide_banner", "-loglevel", "error"];
    if (startSec > 0) args.push("-ss", String(startSec), "-noaccurate_seek"); // áudio e vídeo arrancam juntos no mesmo ponto
    args.push(
      ...(token ? ["-headers", `X-Zeus-Motor-Token: ${token}\r\n`] : []),
      "-i",
      `http://127.0.0.1:${getPort()}/stream/${hash}/${idx}`,
      "-map",
      "0:v:0",
      "-map",
      `0:a:${audioN || 0}?`,
      "-c:v",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ac",
      "2",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof",
      "-f",
      "mp4",
      "pipe:1",
    );
    const ff = spawnProbe(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    ff.stderr.on("data", (d) => console.error("[ffmpeg]", String(d).trim()));
    return ff;
  }
  return {
    probeTracks,
    probeKeyframe,
    transcode,
    stop() {
      for (const process of probes) {
        try {
          process.kill("SIGKILL");
        } catch {}
      }
      probes.clear();
      for (const key of Object.keys(tracksCache)) delete tracksCache[key];
    },
  };
}
module.exports = { createMediaService };
