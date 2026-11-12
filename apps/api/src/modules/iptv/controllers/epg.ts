import type { Context } from "hono";
import * as service from "../services/guide.js";
import { nowQuery, gridQuery, timeWindow } from "../models/epg.js";
export const nowGuide = async (c: Context) => {
  const query = nowQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Pedido inválido." }, 400);
  return c.json(
    await service.nowGuide(
      c.get("member").id,
      c.req.param("listId")!,
      query.data,
    ),
  );
};
export const gridGuide = async (c: Context) => {
  const parsed = gridQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Pedido inválido." }, 400);
  return c.json(
    await service.gridGuide(
      c.get("member").id,
      c.req.param("listId")!,
      parsed.data,
    ),
  );
};
export const channelGuide = async (c: Context) => {
  const query = timeWindow.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Pedido inválido." }, 400);
  return c.json(
    await service.channelGuide(
      c.get("member").id,
      c.req.param("listId")!,
      query.data,
      c.req.param("id")!,
    ),
  );
};
