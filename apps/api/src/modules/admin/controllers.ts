import type { Context } from "hono";
import * as service from "./service.js";

export const listMembers = async (c: Context) => {
  return c.json(await service.listMembers());
};
import { updateMemberInput } from "./models.js";

export const updateMember = async (c: Context) => {
  const input = updateMemberInput.parse(await c.req.json());
  return c.json(await service.updateMember(c.req.param("id")!, input));
};

export const listInvites = async (c: Context) => {
  return c.json(await service.listInvites());
};
import { createInviteInput } from "./models.js";

export const createInvite = async (c: Context) => {
  const input = createInviteInput.parse(await c.req.json());
  return c.json(await service.createInvite(c.get("member").id, input), 201);
};

export const deleteInvite = async (c: Context) => {
  return c.json(await service.deleteInvite(c.req.param("id")!));
};
