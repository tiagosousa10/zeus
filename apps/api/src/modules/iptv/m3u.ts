import { createHash } from "node:crypto";
import { channelTags, cleanFolderName, detectCountry, isAdult } from "./names.js";
import type { Section, SectionData, TVCatalog, TVCategory, TVChannel, TVEpisode, TVMovie, TVSeries } from "./types.js";

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

interface Entry { section: Section; group: string; name: string; logo?: string; epgId?: string; url: string; categoryId: string; id: string }

function sectionOf(path: string, group: string): Section {
  if (path.includes("/live/") || /\.(m3u8|ts)$/i.test(path)) return "live";
  if (path.includes("/movie/")) return "movie";
  if (path.includes("/series/")) return "series";
  const words = cleanFolderName(group).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z0-9]+/);
  if (words.some((w) => ["filmes", "filme", "movies", "movie", "vod"].includes(w))) return "movie";
  if (words.some((w) => ["series", "serie"].includes(w))) return "series";
  return "live";
}

function parse(text: string, base: string): Entry[] {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let pending: Omit<Entry, "section" | "url" | "categoryId" | "id"> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) {
      const attrs = Object.fromEntries([...line.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
      const bare = line.replace(/[\w-]+="[^"]*"/g, (m) => " ".repeat(m.length));
      const comma = bare.indexOf(",");
      pending = {
        name: (comma < 0 ? "" : line.slice(comma + 1).trim()) || "Canal",
        group: attrs["group-title"] || "Outros",
        logo: attrs["tvg-logo"] || undefined,
        epgId: attrs["tvg-id"] || undefined,
      };
    } else if (line && !line.startsWith("#") && pending) {
      try {
        const url = new URL(line, base);
        if (url.protocol === "http:" || url.protocol === "https:") {
          const section = sectionOf(url.pathname, pending.group);
          const categoryId = hash(section + pending.group);
          const key = `${categoryId}|${url.href}`;
          if (!seen.has(key)) {
            seen.add(key);
            entries.push({ ...pending, section, url: url.href, categoryId, id: hash(key) });
          }
        }
      } catch {}
      pending = null;
    }
  }
  return entries;
}

function build<T extends { categoryId: string; adult: boolean }>(kind: Section, entries: Entry[], items: T[]): SectionData<T> {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.categoryId, (counts.get(it.categoryId) ?? 0) + 1);
  const categories = new Map<string, TVCategory>();
  for (const e of entries) {
    if (categories.has(e.categoryId)) continue;
    const name = cleanFolderName(e.group) || "Outros";
    categories.set(e.categoryId, {
      id: e.categoryId, section: kind, name, country: detectCountry(name), adult: isAdult(name), count: counts.get(e.categoryId) ?? 0,
    });
  }
  for (const it of items) if (categories.get(it.categoryId)?.adult) it.adult = true;
  return { categories: [...categories.values()], items };
}

export function normalizeM3U(text: string, base: string, now: number): TVCatalog {
  const entries = parse(text, base);
  const of = (s: Section) => entries.filter((e) => e.section === s);

  const live: TVChannel[] = of("live").map((e) => ({
    id: e.id, categoryId: e.categoryId, name: e.name, logo: e.logo, epgId: e.epgId,
    tags: channelTags(e.name), adult: isAdult(e.name), source: e.url,
  }));

  const movie: TVMovie[] = of("movie").map((e) => {
    const m = e.name.match(/\s*\((\d{4})\)\s*$/);
    const name = m ? e.name.slice(0, m.index) : e.name;
    const ext = new URL(e.url).pathname.match(/\.([a-z0-9]+)$/i)?.[1];
    return {
      id: e.id, categoryId: e.categoryId, name, poster: e.logo, year: m ? Number(m[1]) : undefined,
      container: ext?.toLowerCase() ?? "mp4", adult: isAdult(name), source: e.url,
    };
  });

  const series = new Map<string, TVSeries>();
  for (const e of of("series")) {
    const name = e.name.replace(/\s*S\d+\s*E\d+.*$/i, "").trim() || e.name;
    const id = hash(`series${e.categoryId}${name}`);
    let s = series.get(id);
    if (!s) series.set(id, (s = { id, categoryId: e.categoryId, name, poster: e.logo, adult: isAdult(name), episodes: [] }));
    const sxe = e.name.match(/S(\d+)\s*E(\d+)/i);
    const ext = new URL(e.url).pathname.match(/\.([a-z0-9]+)$/i)?.[1];
    s.episodes!.push({
      id: hash(`${id}|${e.url}`), season: sxe ? Number(sxe[1]) : 1, number: sxe ? Number(sxe[2]) : s.episodes!.length + 1,
      title: e.name, container: ext?.toLowerCase() ?? "mp4", source: e.url,
    });
  }

  return {
    fetchedAt: now,
    live: build("live", of("live"), live),
    movie: build("movie", of("movie"), movie),
    series: build("series", of("series"), [...series.values()]),
  };
}
