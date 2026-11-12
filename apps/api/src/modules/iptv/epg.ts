import { safeFetch } from "../../lib/safe-fetch.js";
import { ProviderError } from "./provider.js";
import { xtreamUrl } from "./xtream.js";
import type { IPTVList } from "./types.js";

export interface Programme { start: number; stop: number; title: string; description?: string }
export type GuideIndex = Map<string, Programme[]>;

let fetcher = safeFetch;
export function setGuideFetch(f: typeof safeFetch): void { fetcher = f; }

function decode(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, value: string) => {
    if (value[0] !== "#") return named[value.toLowerCase()] ?? entity;
    const n = value[1].toLowerCase() === "x" ? parseInt(value.slice(2), 16) : Number(value.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "�";
  });
}
function attribute(text: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`).exec(text);
  return m ? decode(m[2]) : undefined;
}
function element(text: string, name: string): string | undefined {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`).exec(text);
  return m?.[1].split(/(<!\[CDATA\[[\s\S]*?\]\]>)/).map((part) =>
    part.startsWith("<![CDATA[") ? part.slice(9, -3) : decode(part.replace(/<[^>]*>/g, "")),
  ).join("").trim();
}
function timestamp(value: string | undefined): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?$/.exec(value ?? "");
  if (!m) return NaN;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return NaN;
  const zoneHour = Number(m[8] ?? 0), zoneMinute = Number(m[9] ?? 0);
  if (zoneHour > 23 || zoneMinute > 59) return NaN;
  const offset = (zoneHour * 60 + zoneMinute) * 60_000 * (m[7] === "-" ? -1 : 1);
  return date.getTime() - offset;
}

export function parseXmltv(text: string, from: number, to: number): GuideIndex {
  const index: GuideIndex = new Map();
  // XMLTV is large; retain only programmes in the requested window, without building a DOM.
  for (const m of text.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme\s*>/g)) {
    const start = timestamp(attribute(m[1], "start")), stop = timestamp(attribute(m[1], "stop"));
    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start || stop <= from || start >= to) continue;
    const channel = attribute(m[1], "channel")?.toLowerCase();
    const title = element(m[2], "title");
    if (!channel || title === undefined) continue;
    const description = element(m[2], "desc");
    const programme: Programme = { start, stop, title, ...(description ? { description } : {}) };
    const entries = index.get(channel);
    if (entries) entries.push(programme); else index.set(channel, [programme]);
  }
  for (const programmes of index.values()) programmes.sort((a, b) => a.start - b.start);
  return index;
}

export async function fetchGuide(list: IPTVList, now: number): Promise<GuideIndex> {
  if (!list.epgUrl && list.type === "m3u") return new Map();
  try {
    let url = list.epgUrl;
    if (!url) {
      const u = new URL("/xmltv.php", list.url);
      u.searchParams.set("username", list.username ?? ""); u.searchParams.set("password", list.password ?? "");
      url = u.href;
    }
    const r = await fetcher(url, { timeout: 120_000, maxBytes: 160 * 1024 * 1024 });
    if (!r.ok) throw new ProviderError();
    const text = await r.text();
    if (!/<tv(?:\s|>)/.test(text)) throw new ProviderError();
    const yesterday = Math.floor(now / 86_400_000) * 86_400_000 - 86_400_000;
    return parseXmltv(text, yesterday, now + 7 * 86_400_000);
  } catch { throw new ProviderError(); }
}

export function nowNext(index: GuideIndex, epgId: string | undefined, now: number): { now?: Programme; next?: Programme } {
  const entries = index.get(epgId?.toLowerCase() ?? "") ?? [];
  const current = entries.find((p) => p.start <= now && p.stop > now);
  const next = entries.find((p) => p.start > now);
  return { ...(current ? { now: current } : {}), ...(next ? { next } : {}) };
}
export function programmesBetween(index: GuideIndex, epgId: string | undefined, from: number, to: number): Programme[] {
  return (index.get(epgId?.toLowerCase() ?? "") ?? []).filter((p) => p.stop > from && p.start < to);
}
export async function fetchShortEpg(list: IPTVList, streamId: string): Promise<Programme[]> {
  if (list.type === "m3u") return [];
  try {
    const r = await fetcher(xtreamUrl(list, "get_short_epg", { stream_id: streamId, limit: "10" }), { timeout: 60_000, maxBytes: 2 * 1024 * 1024 });
    if (!r.ok) throw new ProviderError();
    const data = await r.json() as { epg_listings?: unknown };
    if (!Array.isArray(data?.epg_listings)) throw new ProviderError();
    const programmes: Programme[] = [];
    for (const item of data.epg_listings) {
      if (!item || typeof item !== "object") continue;
      const start = Number(item.start_timestamp) * 1000, stop = Number(item.stop_timestamp) * 1000;
      if (!Number.isFinite(start) || !Number.isFinite(stop) || start <= 0 || stop <= start || typeof item.title !== "string") continue;
      const title = Buffer.from(item.title, "base64").toString("utf8");
      const description = typeof item.description === "string" ? Buffer.from(item.description, "base64").toString("utf8") : "";
      programmes.push({ start, stop, title, ...(description ? { description } : {}) });
    }
    return programmes.sort((a, b) => a.start - b.start);
  } catch { throw new ProviderError(); }
}
