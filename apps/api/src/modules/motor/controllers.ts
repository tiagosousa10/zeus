import type { Context } from "hono";
import * as service from "./service.js";

export const motorStatus = async (c: Context) => {
  return c.json(await service.motorStatus(c.get("member").id));
};
import { startMotorInput } from "./models.js";

export const startMotor = async (c: Context) => {
  const input = startMotorInput.parse(await c.req.json());
  return c.json(
    await service.startMotor(c.get("member").id, c.req.raw.signal, input),
  );
};

export const streamMotor = async (c: Context) => {
  return await service.streamMotor(
    c.get("member").id,
    c.req.param("hash")! + "/" + c.req.param("index")!,
    c.req.raw,
  );
};
import { stopMotorInput } from "./models.js";

export const stopMotor = async (c: Context) => {
  const input = stopMotorInput.parse(await c.req.json());
  return c.json(await service.stopMotor(c.get("member").id, input));
};
