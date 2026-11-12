import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import bundledFfmpeg from "ffmpeg-static";
// The CommonJS package exports a path; NodeNext interprets its declarations differently.
const bundledPath: unknown = bundledFfmpeg;
const ffmpeg = process.env.ZEUS_FFMPEG_PATH ||
  (typeof bundledPath === "string"
    ? bundledPath.replace("app.asar/", "app.asar.unpacked/")
    : null);
import type { PlaySession } from "./sessions.js";

// ffmpeg only receives this local capability URL; all provider access stays in safeStream.
export async function startBridge(
  s: PlaySession,
  open: (range?: string, signal?: AbortSignal) => Promise<Response>,
  signal: AbortSignal = s.signal,
): Promise<string> {
  const path = `/${randomBytes(32).toString("hex")}`;
  const lifetime = new AbortController();
  const combined = AbortSignal.any([s.signal, signal, lifetime.signal]);
  if (combined.aborted) throw new Error("Reprodução cancelada.");
  const server = createServer(async (req, res) => {
    if (req.url !== path || (req.method !== "GET" && req.method !== "HEAD")) {
      res.writeHead(404).end();
      return;
    }
    const request = new AbortController();
    res.on("close", () => request.abort());
    try {
      const response = await open(req.headers.range, AbortSignal.any([combined, request.signal]));
      res.statusCode = response.status;
      for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const value = response.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (req.method === "HEAD" || !response.body) {
        await response.body?.cancel();
        res.end();
      } else {
        await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), res);
      }
    } catch {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  });
  const close = () => {
    lifetime.abort();
    server.close();
    server.closeAllConnections();
    s.onEnd.delete(close);
    s.signal.removeEventListener("abort", close);
    signal.removeEventListener("abort", close);
  };
  s.onEnd.add(close);
  s.signal.addEventListener("abort", close, { once: true });
  signal.addEventListener("abort", close, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    if (combined.aborted) throw new Error("Reprodução cancelada.");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Ponte indisponível.");
    return `http://127.0.0.1:${address.port}${path}`;
  } catch (error) {
    close();
    throw error;
  }
}

export function remux(input: string, startSec: number, signal: AbortSignal): ReadableStream<Uint8Array> {
  // Constrain the process even if the provider returns a playlist disguised as a media file.
  const url = new URL(input);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !Number.isFinite(startSec) || startSec < 0) {
    throw new Error("Pedido inválido.");
  }
  if (!ffmpeg || signal.aborted) throw new Error("Reprodução cancelada.");
  const child = spawn(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "http,tcp",
    "-format_whitelist", "matroska,webm,avi,mov,mp4,m4a,3gp,3g2,mj2,mpeg,mpegts,ogg,flv,asf",
    ...(startSec > 0 ? ["-ss", String(startSec), "-noaccurate_seek"] : []),
    "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2",
    "-avoid_negative_ts", "make_zero", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1",
  ], { stdio: ["ignore", "pipe", "ignore"] });
  let ended = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stop = () => { child.kill("SIGKILL"); };
  const fail = () => {
    if (!ended) { ended = true; controller.error(new Error("Não foi possível reproduzir este conteúdo.")); }
    stop();
  };
  signal.addEventListener("abort", fail, { once: true });
  return new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      child.stdout.on("data", (chunk: Buffer) => {
        if (ended) return;
        controller.enqueue(chunk);
        if ((controller.desiredSize ?? 0) <= 0) child.stdout.pause();
      });
      child.stdout.on("error", fail);
      child.on("error", fail);
      child.on("close", (code) => {
        signal.removeEventListener("abort", fail);
        if (ended) return;
        ended = true;
        if (code === 0) controller.close();
        else controller.error(new Error("Não foi possível reproduzir este conteúdo."));
      });
      if (signal.aborted) fail();
    },
    pull() { child.stdout.resume(); },
    cancel() { ended = true; stop(); },
  });
}
