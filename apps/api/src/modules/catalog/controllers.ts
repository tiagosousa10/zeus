import type { Context } from "hono";
import * as service from "./service.js";
import { getMetadataInput } from "./models.js";

export const getMetadata = async (c: Context) => {
  const input = getMetadataInput.parse(c.req.query());
  return c.json(await service.getMetadata(c.get("member").id, input));
};
