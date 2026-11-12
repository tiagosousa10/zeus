import type { Context } from "hono";
import * as playback from "../services/playback.js";
import { playBody, seekTime } from "../models/playback.js";
import type { PlaybackRequest } from "../models/playback-request.js";
function playbackRequest(c: Context): PlaybackRequest {
  return {
    memberId: c.get("member").id,
    signal: c.req.raw.signal,
    token: c.req.param("token") ?? "",
    listId: c.req.param("listId") ?? "",
    resourceId: c.req.param("id") ?? "",
    range: c.req.header("range"),
  };
}
export const stopPlayback = (c: Context) =>
  playback.stopPlayback(playbackRequest(c));
export const startPlayback = async (c: Context) => {
  const body = playBody.safeParse(await c.req.json().catch(() => undefined));
  if (!body.success) return c.json({ error: "Pedido inválido." }, 400);
  return playback.startPlayback(playbackRequest(c), body.data);
};
export const indexPlaylist = (c: Context) =>
  playback.indexPlaylist(playbackRequest(c));
export const playResource = (c: Context) =>
  playback.playResource(playbackRequest(c));
export const playLive = (c: Context) => playback.playLive(playbackRequest(c));
export const playFile = (c: Context) => playback.playFile(playbackRequest(c));
export const playRemux = (c: Context) => {
  const time = seekTime.safeParse(c.req.query("t") ?? 0);
  if (!time.success) return c.json({ error: "Pedido inválido." }, 400);
  return playback.playRemux(playbackRequest(c), time.data);
};
