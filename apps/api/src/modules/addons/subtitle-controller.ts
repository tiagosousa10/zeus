import type { Context } from "hono";
import * as service from "./subtitle-service.js";
import { listSubtitlesInput } from "./models.js";

export const listSubtitles = async (c: Context) => {
  const input = listSubtitlesInput.parse(c.req.query());
  return c.json(await service.listSubtitles(c.get("member").id, input));
};
import { subtitleFileInput } from "./models.js";

export const subtitleFile = async (c: Context) => {
  const input = subtitleFileInput.parse(c.req.query());
  return c.body(await service.subtitleFile(input), 200, {
    "content-type": "text/vtt; charset=utf-8",
    "cache-control": "private, max-age=86400",
  });
};
