import type { Context } from "hono";
import * as service from "../services/catalog.js";
import { sectionSchema, pageQuery } from "../models/catalog.js";
export const listSections = async (c: Context) => {
  return c.json(
    await service.listSections(c.get("member").id, c.req.param("listId")!),
  );
};
export const refreshList = async (c: Context) => {
  return c.json(
    await service.refreshList(c.get("member").id, c.req.param("listId")!),
  );
};
export const listSearchIndex = async (c: Context) => {
  return c.json(
    await service.listSearchIndex(c.get("member").id, c.req.param("listId")!),
  );
};
export const listCategory = async (c: Context) => {
  const section = sectionSchema.safeParse(c.req.param("section"));
  const query = pageQuery.safeParse(c.req.query());
  if (!section.success || !query.success)
    return c.json({ error: "Pedido inválido." }, 400);
  return c.json(
    await service.listCategory(
      c.get("member").id,
      c.req.param("listId")!,
      section.data,
      query.data,
      c.req.param("categoryId")!,
    ),
  );
};
export const detailFor =
  (section: "movie" | "series") => async (c: Context) => {
    return c.json(
      await service.detailFor(
        c.get("member").id,
        c.req.param("listId")!,
        section,
        c.req.param("id")!,
      ),
    );
  };
