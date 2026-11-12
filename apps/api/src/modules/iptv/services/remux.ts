import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { nativeEnvironment } from "../../../../../../packages/local-config/process-env.cjs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import bundledFfmpeg from "ffmpeg-static";
// The CommonJS package exports a path; NodeNext interprets its declarations differently.
const bundledPath: unknown = bundledFfmpeg;
const ffmpeg =
  process.env.ZEUS_FFMPEG_PATH ||
  (typeof bundledPath === "string"
    ? bundledPath.replace("app.asar/", "app.asar.unpacked/")
    : null);
import type { PlaySession } from "./sessions.js";

export class RemuxBusyError extends Error {
  constructor() {
    super("O conversor está ocupado. Tenta novamente dentro de instantes.");
  }
}
export interface RemuxOptions {
  transcodeVideo?: boolean;
}

type Reservation = {
  userId: string;
  onClosed: Set<() => void>;
  waiting: boolean;
};
const active = new Map<string, Reservation>();

// Connections may deliver a seek before the old HTTP cancellation. One bounded
// waiter tolerates either event order, without stopping a still-active converter.
function waitForClose(
  previous: Reservation,
  signal: AbortSignal,
): Promise<void> {
  previous.waiting = true;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      previous.waiting = false;
      previous.onClosed.delete(closed);
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new Error("Reprodução cancelada."));
    const closed = () => finish();
    const timer = setTimeout(() => finish(new RemuxBusyError()), 1000);
    previous.onClosed.add(closed);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Reserve before opening the bridge, and keep the reservation until FFmpeg exits. */
export async function remuxSession(
  session: PlaySession,
  startSec: number,
  signal: AbortSignal,
  open: (range?: string, signal?: AbortSignal) => Promise<Response>,
  options: RemuxOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  if (signal.aborted || session.ended) throw new Error("Reprodução cancelada.");
  const previous = active.get(session.token);
  if (previous && !previous.waiting)
    await waitForClose(previous, AbortSignal.any([signal, session.signal]));
  if (signal.aborted || session.ended) throw new Error("Reprodução cancelada.");
  if (
    active.has(session.token) ||
    active.size >= 8 ||
    [...active.values()].filter((entry) => entry.userId === session.userId)
      .length >= 2
  )
    throw new RemuxBusyError();
  const lifetime = new AbortController();
  const combined = AbortSignal.any([signal, session.signal, lifetime.signal]);
  const reservation: Reservation = {
    userId: session.userId,
    onClosed: new Set(),
    waiting: false,
  };
  active.set(session.token, reservation);
  const release = () => {
    active.delete(session.token);
    lifetime.abort();
    for (const notify of reservation.onClosed) notify();
    reservation.onClosed.clear();
  };
  try {
    const input = await startBridge(session, open, combined);
    return remux(
      input,
      startSec,
      combined,
      release,
      () => lifetime.abort(),
      options,
    );
  } catch (error) {
    release();
    throw error;
  }
}

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
      const response = await open(
        req.headers.range,
        AbortSignal.any([combined, request.signal]),
      );
      res.statusCode = response.status;
      for (const name of [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
      ]) {
        const value = response.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (req.method === "HEAD" || !response.body) {
        await response.body?.cancel();
        res.end();
      } else {
        await pipeline(
          Readable.fromWeb(
            response.body as import("node:stream/web").ReadableStream,
          ),
          res,
        );
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
    if (!address || typeof address === "string")
      throw new Error("Ponte indisponível.");
    return `http://127.0.0.1:${address.port}${path}`;
  } catch (error) {
    close();
    throw error;
  }
}

export function remux(
  input: string,
  startSec: number,
  signal: AbortSignal,
  onClose: () => void = () => {},
  onStop: () => void = () => {},
  options: RemuxOptions = {},
): ReadableStream<Uint8Array> {
  // Constrain the process even if the provider returns a playlist disguised as a media file.
  const url = new URL(input);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !Number.isFinite(startSec) ||
    startSec < 0
  ) {
    throw new Error("Pedido inválido.");
  }
  if (!ffmpeg || signal.aborted) throw new Error("Reprodução cancelada.");
  const child = spawn(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-protocol_whitelist",
      "http,tcp",
      "-format_whitelist",
      "matroska,webm,avi,mov,mp4,m4a,3gp,3g2,mj2,mpeg,mpegts,ogg,flv,asf",
      ...(startSec > 0 ? ["-ss", String(startSec), "-noaccurate_seek"] : []),
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      ...(options.transcodeVideo
        ? [
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-tune",
            "zerolatency",
            "-vf",
            "bwdif=mode=send_frame:deint=interlaced,scale=w=min(1280\\,iw):h=-2,fps=25",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "2",
            "-filter_threads",
            "2",
            "-g",
            "50",
          ]
        : ["-c:v", "copy"]),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ac",
      "2",
      "-avoid_negative_ts",
      "make_zero",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof",
      "-f",
      "mp4",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "ignore"], env: nativeEnvironment() },
  );
  let ended = false;
  let failed = false;
  let stopping = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    onStop();
    child.kill("SIGKILL");
  };
  const fail = () => {
    failed = true;
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
        onClose();
        if (ended) return;
        ended = true;
        if (code === 0 && !failed) controller.close();
        else
          controller.error(
            new Error("Não foi possível reproduzir este conteúdo."),
          );
      });
      if (signal.aborted) fail();
    },
    pull() {
      child.stdout.resume();
    },
    cancel() {
      ended = true;
      stop();
    },
  });
}
