import type { Context } from "hono";
import * as service from "./account-service.js";
import { registration } from "./models.js";

export const bootstrapStatus = async (c: Context) => {
  return c.json(await service.bootstrapStatus());
};

export const authConfiguration = async (c: Context) => {
  return c.json(await service.authConfiguration());
};

export const bootstrapAdministrator = async (c: Context) => {
  const input = registration.parse(await c.req.json());
  return await service.bootstrapAdministrator(c.req.raw.headers, input);
};

export const acceptInvitation = async (c: Context) => {
  const input = registration.parse(await c.req.json());
  return await service.acceptInvitation(c.req.raw.headers, input);
};

export const currentSession = async (c: Context) => {
  return c.json(await service.currentSession(c.req.raw.headers));
};

export const handleAuthentication = async (c: Context) => {
  return await service.handleAuthentication(c.req.raw);
};
