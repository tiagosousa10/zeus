import type { Context } from "hono";
import * as service from "./stream-service.js";
import { listStreamsInput } from "./models.js";

export const listStreams = async (c: Context) => {
  const input = listStreamsInput.parse(c.req.query());
  return c.json(await service.listStreams(c.get("member").id, input));
};
