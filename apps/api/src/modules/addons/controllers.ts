import type { Context } from "hono";
import * as service from "./service.js";

export const listApprovedAddons = async (c: Context) => {
  return c.json(await service.listApprovedAddons());
};

export const listAllAddons = async (c: Context) => {
  return c.json(await service.listAllAddons());
};
import { updateAddonInput } from "./models.js";

export const updateAddon = async (c: Context) => {
  const input = updateAddonInput.parse(await c.req.json());
  return c.json(await service.updateAddon(c.req.param("id")!, input));
};

export const syncAddons = async (c: Context) => {
  return c.json(await service.syncAddons());
};
