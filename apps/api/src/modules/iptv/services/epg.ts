import { safeFetch } from "../../../lib/safe-fetch.js";
import { ProviderError } from "./provider.js";
import { xtreamUrl } from "./xtream.js";
import type { IPTVList } from "../../../../../../packages/contracts/iptv.js";
import { setImmediate as yieldToRequests } from "node:timers/promises";

export interface Programme {
  start: number;
  stop: number;
  title: string;
  description?: string;
}
export type GuideIndex = Map<string, Programme[]>;

let fetcher = safeFetch;
export function setGuideFetch(f: typeof safeFetch): void {
  fetcher = f;
}

function decode(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return text.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (entity, value: string) => {
      if (value[0] !== "#") return named[value.toLowerCase()] ?? entity;
      const n =
        value[1].toLowerCase() === "x"
          ? parseInt(value.slice(2), 16)
          : Number(value.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : "�";
    },
  );
}
function attribute(text: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`).exec(
    text,
  );
  return m ? decode(m[2]) : undefined;
}
function element(text: string, name: string): string | undefined {
  let cursor = 0,
    depth = 0;
  const chunks: string[] = [];
  while (cursor < text.length) {
    const start = text.indexOf("<", cursor);
    if (start < 0) break;
    if (depth) chunks.push(decode(text.slice(cursor, start)));
    if (text.startsWith("<![CDATA[", start)) {
      const end = text.indexOf("]]>", start + 9);
      if (end < 0) throw new Error("XMLTV inválido.");
      if (depth) chunks.push(text.slice(start + 9, end));
      cursor = end + 3;
      continue;
    }
    if (text.startsWith("<!--", start)) {
      const end = text.indexOf("-->", start + 4);
      if (end < 0) throw new Error("XMLTV inválido.");
      cursor = end + 3;
      continue;
    }
    const end = tagEnd(text, start);
    const tag = text.slice(start + 1, end);
    cursor = end + 1;
    if (tag.startsWith("!") || tag.startsWith("?")) continue;
    const match = /^(\/)?([\w:.-]+)(?=\s|\/|$)/.exec(tag);
    if (!match) throw new Error("XMLTV inválido.");
    if (match[1]) {
      if (depth && --depth === 0) return chunks.join("").trim();
    } else if (!/\/\s*$/.test(tag)) {
      if (depth || match[2] === name) depth++;
    } else if (!depth && match[2] === name) return "";
  }
  return undefined;
}

function tagEnd(text: string, start: number): number {
  let quote = "";
  for (
    let end = start + 1;
    end < text.length && end - start <= 16 * 1024;
    end++
  ) {
    const char = text[end];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ">") return end;
    else if (char === "<") break;
  }
  throw new Error("XMLTV inválido.");
}
function timestamp(value: string | undefined): number {
  const m =
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?$/.exec(
      value ?? "",
    );
  if (!m) return NaN;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return NaN;
  const zoneHour = Number(m[8] ?? 0),
    zoneMinute = Number(m[9] ?? 0);
  if (zoneHour > 23 || zoneMinute > 59) return NaN;
  const offset =
    (zoneHour * 60 + zoneMinute) * 60_000 * (m[7] === "-" ? -1 : 1);
  return date.getTime() - offset;
}

// Move forwards exactly once. Never search for a closing programme again from each
// opening tag: malformed XML otherwise turns a small guide into quadratic CPU work.
function* programmeBlocks(
  text: string,
): Generator<[string, string] | undefined> {
  if (text.length > 160 * 1024 * 1024)
    throw new Error("XMLTV demasiado grande.");
  let cursor = 0,
    body = -1,
    attributes = "",
    tokens = 0;
  const stack: string[] = [];
  while (cursor < text.length) {
    const start = text.indexOf("<", cursor);
    if (start < 0) break;
    if (body >= 0 && start - body > 256 * 1024)
      throw new Error("Programa XMLTV demasiado grande.");
    if (++tokens > 4_000_000) throw new Error("XMLTV demasiado complexo.");
    if (text.startsWith("<![CDATA[", start) || text.startsWith("<!--", start)) {
      const cdata = text.startsWith("<![CDATA[", start);
      const end = text.indexOf(cdata ? "]]>" : "-->", start + (cdata ? 9 : 4));
      if (end < 0 || end - start > 256 * 1024)
        throw new Error("XMLTV inválido.");
      cursor = end + 3;
    } else {
      const end = tagEnd(text, start);
      const tag = text.slice(start + 1, end);
      cursor = end + 1;
      if (!tag.startsWith("?") && !tag.startsWith("!")) {
        const match = /^(\/)?([\w:.-]+)(?=\s|\/|$)/.exec(tag);
        if (!match) throw new Error("XMLTV inválido.");
        const name = match[2],
          closing = !!match[1],
          empty = /\/\s*$/.test(tag);
        if (closing) {
          if (stack.pop() !== name) throw new Error("XMLTV inválido.");
          if (name === "programme") {
            if (body < 0) throw new Error("XMLTV inválido.");
            yield [attributes, text.slice(body, start)];
            body = -1;
          }
        } else {
          if (name === "programme" && body >= 0)
            throw new Error("XMLTV inválido.");
          if (!empty) {
            stack.push(name);
            if (stack.length > 64) throw new Error("XMLTV demasiado profundo.");
            if (name === "programme") {
              attributes = tag.slice(name.length);
              body = cursor;
            }
          }
        }
      }
    }
    // The asynchronous consumer yields even for guides containing no programmes.
    if (tokens % 4096 === 0) yield undefined;
  }
  if (stack.length || body >= 0) throw new Error("XMLTV incompleto.");
}

function appendProgramme(
  index: GuideIndex,
  m: [string, string],
  from: number,
  to: number,
) {
  const start = timestamp(attribute(m[0], "start")),
    stop = timestamp(attribute(m[0], "stop"));
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(stop) ||
    stop <= start ||
    stop <= from ||
    start >= to
  )
    return;
  const channel = attribute(m[0], "channel")?.toLowerCase();
  const title = element(m[1], "title");
  if (!channel || title === undefined) return;
  const description = element(m[1], "desc");
  const programme: Programme = {
    start,
    stop,
    title,
    ...(description ? { description } : {}),
  };
  const entries = index.get(channel);
  if (entries) entries.push(programme);
  else index.set(channel, [programme]);
}

export function parseXmltv(text: string, from: number, to: number): GuideIndex {
  const index: GuideIndex = new Map();
  for (const block of programmeBlocks(text))
    if (block) appendProgramme(index, block, from, to);
  for (const programmes of index.values())
    programmes.sort((a, b) => a.start - b.start);
  return index;
}

export async function fetchGuide(
  list: IPTVList,
  now: number,
): Promise<GuideIndex> {
  if (!list.epgUrl && list.type === "m3u") return new Map();
  try {
    let url = list.epgUrl;
    if (!url) {
      const u = new URL("/xmltv.php", list.url);
      u.searchParams.set("username", list.username ?? "");
      u.searchParams.set("password", list.password ?? "");
      url = u.href;
    }
    const r = await fetcher(url, {
      timeout: 120_000,
      maxBytes: 160 * 1024 * 1024,
    });
    if (!r.ok) throw new ProviderError();
    const text = await r.text();
    if (!/<tv(?:\s|>)/.test(text)) throw new ProviderError();
    const yesterday = Math.floor(now / 86_400_000) * 86_400_000 - 86_400_000;
    const index: GuideIndex = new Map();
    const deadline = performance.now() + 10_000;
    let programmes = 0;
    for (const block of programmeBlocks(text)) {
      if (block) {
        if (++programmes > 1_000_000)
          throw new Error("XMLTV demasiado complexo.");
        appendProgramme(index, block, yesterday, now + 7 * 86_400_000);
      } else {
        if (performance.now() > deadline)
          throw new Error("XMLTV demasiado lento.");
        await yieldToRequests();
      }
    }
    for (const programmes of index.values())
      programmes.sort((a, b) => a.start - b.start);
    return index;
  } catch {
    throw new ProviderError();
  }
}

export function nowNext(
  index: GuideIndex,
  epgId: string | undefined,
  now: number,
): { now?: Programme; next?: Programme } {
  const entries = index.get(epgId?.toLowerCase() ?? "") ?? [];
  const current = entries.find((p) => p.start <= now && p.stop > now);
  const next = entries.find((p) => p.start > now);
  return { ...(current ? { now: current } : {}), ...(next ? { next } : {}) };
}
export function programmesBetween(
  index: GuideIndex,
  epgId: string | undefined,
  from: number,
  to: number,
): Programme[] {
  return (index.get(epgId?.toLowerCase() ?? "") ?? []).filter(
    (p) => p.stop > from && p.start < to,
  );
}
export async function fetchShortEpg(
  list: IPTVList,
  streamId: string,
): Promise<Programme[]> {
  if (list.type === "m3u") return [];
  try {
    const r = await fetcher(
      xtreamUrl(list, "get_short_epg", { stream_id: streamId, limit: "10" }),
      { timeout: 60_000, maxBytes: 2 * 1024 * 1024 },
    );
    if (!r.ok) throw new ProviderError();
    const data = (await r.json()) as { epg_listings?: unknown };
    if (!Array.isArray(data?.epg_listings)) throw new ProviderError();
    const programmes: Programme[] = [];
    for (const item of data.epg_listings) {
      if (!item || typeof item !== "object") continue;
      const start = Number(item.start_timestamp) * 1000,
        stop = Number(item.stop_timestamp) * 1000;
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(stop) ||
        start <= 0 ||
        stop <= start ||
        typeof item.title !== "string"
      )
        continue;
      const title = Buffer.from(item.title, "base64").toString("utf8");
      const description =
        typeof item.description === "string"
          ? Buffer.from(item.description, "base64").toString("utf8")
          : "";
      programmes.push({
        start,
        stop,
        title,
        ...(description ? { description } : {}),
      });
    }
    return programmes.sort((a, b) => a.start - b.start);
  } catch {
    throw new ProviderError();
  }
}
