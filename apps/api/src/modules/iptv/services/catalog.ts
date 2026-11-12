import { getCatalog, getMovie, getSeries } from "../services/cache.js";
import { findList } from "./lists.js";
import { NOT_AVAILABLE } from "../models/errors.js";
import { DomainError } from "../../../lib/domain-error.js";
import {
  categoryPage,
  publicItem,
  publicSeriesDetail,
  searchIndex,
  sectionsView,
  visibleItem,
} from "../models/views.js";
import type { TVSeriesDetail } from "../../../../../../packages/contracts/iptv.js";

function unavailable(payload: { error: string }): never {
  throw new DomainError("not_found", payload);
}
export const listSections = async (memberId: string, listId: string) => {
  const found = await findList(memberId, listId);
  if (!found) return unavailable({ error: "Lista IPTV não encontrada." });

  return sectionsView(await getCatalog(memberId, found.list), found.prefs);
};
export const refreshList = async (memberId: string, listId: string) => {
  const found = await findList(memberId, listId);
  if (!found) return unavailable({ error: "Lista IPTV não encontrada." });

  return sectionsView(
    await getCatalog(memberId, found.list, { force: true }),
    found.prefs,
  );
};
export const listSearchIndex = async (memberId: string, listId: string) => {
  const found = await findList(memberId, listId);
  if (!found) return unavailable({ error: "Lista IPTV não encontrada." });

  return searchIndex(await getCatalog(memberId, found.list), found.prefs);
};
export const listCategory = async (
  memberId: string,
  listId: string,
  section: import("../../../../../../packages/contracts/iptv.js").Section,
  query: import("../models/catalog.js").PageQuery,
  categoryId: string,
) => {
  const found = await findList(memberId, listId);
  if (!found) return unavailable({ error: "Lista IPTV não encontrada." });

  const catalog = await getCatalog(memberId, found.list);
  const page = categoryPage(
    catalog,
    found.prefs,
    section,
    categoryId,
    query.page,
    query.size,
    {
      anchor: query.anchor,
      q: query.q,
      tag: query.tag,
      favorites: query.favorites === "1",
    },
  );
  return page ? page : unavailable({ error: NOT_AVAILABLE });
};
export const detailFor = async (
  memberId: string,
  listId: string,
  section: "movie" | "series",
  id: string,
) => {
  const userId = memberId;
  const found = await findList(userId, listId);
  if (!found) return unavailable({ error: "Lista IPTV não encontrada." });

  const catalog = await getCatalog(userId, found.list);
  if (!visibleItem(catalog, found.prefs, section, id))
    return unavailable({ error: NOT_AVAILABLE });
  const detail =
    section === "movie"
      ? await getMovie(userId, found.list, id)
      : await getSeries(userId, found.list, id);
  return detail
    ? section === "movie"
      ? publicItem(detail)
      : publicSeriesDetail(detail as TVSeriesDetail)
    : unavailable({ error: NOT_AVAILABLE });
};
