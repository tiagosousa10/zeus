import type { Context } from "hono";
import * as service from "./settings-service.js";
import { patch } from "./models.js";

export const readMemberState = async (c: Context) => {
  return c.json(await service.readMemberState(c.get("member").id));
};

export const updateMemberState = async (c: Context) => {
  const input = patch.parse(await c.req.json());
  return c.json(await service.updateMemberState(c.get("member").id, input));
};
