import { getCatalog, getGuide } from "../services/cache.js";
import { fetchShortEpg, nowNext, programmesBetween } from "../services/epg.js";
import {
  adultItemsVisible,
  isCategoryHidden,
  orderCategories,
  type TVListPrefs,
} from "../models/prefs.js";
import { findList } from "./lists.js";
import { NOT_AVAILABLE } from "../models/errors.js";
import { DomainError } from "../../../lib/domain-error.js";
import type {
  IPTVList,
  TVCatalog,
} from "../../../../../../packages/contracts/iptv.js";

import { overlappingGuideDays } from "../../../../../../packages/contracts/guide-days.js";

const noGuide = (list: IPTVList) => list.type === "m3u" && !list.epgUrl;

function channels(catalog: TVCatalog, prefs: TVListPrefs, category?: string) {
  const cats = orderCategories(catalog.live.categories, prefs).filter(
    (c) => !c.hidden && (!category || category === c.id),
  );
  const allowed = new Set(cats.map((c) => c.id));
  const adult = adultItemsVisible(catalog.live.categories, prefs);
  const rank = new Map(cats.map((c, i) => [c.id, i]));
  return catalog.live.items
    .filter((c) => allowed.has(c.categoryId) && (adult || !c.adult))
    .sort((a, b) => rank.get(a.categoryId)! - rank.get(b.categoryId)!);
}
function categoryAvailable(
  catalog: TVCatalog,
  prefs: TVListPrefs,
  id?: string,
): boolean {
  if (!id) return true;
  const category = catalog.live.categories.find((c) => c.id === id);
  return !!category && !isCategoryHidden(category, prefs);
}

function unavailable(payload: { error: string }): never {
  throw new DomainError("not_found", payload);
}
export const nowGuide = async (
  memberId: string,
  listId: string,
  query: import("../models/epg.js").NowQuery,
) => {
  const userId = memberId;
  const found = await findList(userId, listId);
  if (!found) return unavailable({ error: "Lista IPTV não encontrada." });

  const catalog = await getCatalog(userId, found.list);
  if (!categoryAvailable(catalog, found.prefs, query.category))
    return unavailable({ error: NOT_AVAILABLE });
  const index = await getGuide(userId, found.list);
  const now = Date.now();
  const entries = channels(catalog, found.prefs, query.category)
    .map((channel) => [channel.id, nowNext(index, channel.epgId, now)] as const)
    .filter(([, pair]) => pair.now || pair.next);
  return Object.fromEntries(entries);
};
export const gridGuide = async (
  memberId: string,
  listId: string,
  q: import("../models/epg.js").GridQuery,
) => {
  const userId = memberId;
  const found = await findList(userId, listId);
  if (!found) return unavailable({ error: "Lista IPTV não encontrada." });

  const catalog = await getCatalog(userId, found.list);
  if (!categoryAvailable(catalog, found.prefs, q.category))
    return unavailable({ error: NOT_AVAILABLE });
  let all = noGuide(found.list)
    ? []
    : channels(catalog, found.prefs, q.category);
  if (q.favorites === "1") {
    const favorites = new Set(found.prefs.favorites.live);
    all = all.filter((channel) => favorites.has(channel.id));
  }
  const page = all.slice(q.page * q.size, q.page * q.size + q.size);
  const index = !noGuide(found.list)
    ? await getGuide(userId, found.list)
    : new Map();
  // Availability is independent of the selected window, and bounded to useful civil dates.
  const availability = {
    from: Date.now() - 2 * 86400000,
    to: Date.now() + 9 * 86400000,
    timezone: q.timezone,
  };
  function* programmes() {
    for (const channel of all)
      yield* index.get(channel.epgId?.toLowerCase() ?? "") ?? [];
  }
  return {
    availability,
    availableDays: overlappingGuideDays(
      programmes(),
      q.timezone,
      availability.from,
      availability.to,
    ),
    channels: page.map(({ id, name, number, logo, epgId, categoryId }) => ({
      id,
      name,
      number,
      logo,
      categoryId,
      programmes: programmesBetween(index, epgId, q.from, q.to),
    })),
    total: all.length,
    page: q.page,
    size: q.size,
  };
};
export const channelGuide = async (
  memberId: string,
  listId: string,
  query: import("../models/epg.js").TimeWindow,
  channelId: string,
) => {
  const userId = memberId;
  const found = await findList(userId, listId);
  if (!found) return unavailable({ error: "Lista IPTV não encontrada." });

  const catalog = await getCatalog(userId, found.list);
  const channel = channels(catalog, found.prefs).find(
    (ch) => ch.id === channelId,
  );
  if (!channel) return unavailable({ error: NOT_AVAILABLE });
  const index = await getGuide(userId, found.list);
  const { from, to } = query;
  if (channel.epgId && index.has(channel.epgId.toLowerCase()))
    return programmesBetween(index, channel.epgId, from, to);
  const short = await fetchShortEpg(found.list, channel.id);
  return short.filter((p) => p.stop > from && p.start < to);
};
