export interface Channel {
  id: string;
  name: string;
  group: string;
  url: string;
  logo?: string;
  epgId?: string;
}
export interface IPTVList {
  id: string;
  name: string;
  type: "m3u" | "xtream";
  url: string;
  username?: string;
  password?: string;
  epgUrl?: string;
}
export function parseM3U(text: string, base: string): Channel[] {
  const channels: Channel[] = [];
  let pending: Omit<Channel, "url"> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) {
      const attrs = Object.fromEntries(
        [...line.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
      );
      const comma = line.indexOf(",", line.lastIndexOf('"') + 1);
      pending = {
        id: String(channels.length),
        name: line.slice(comma + 1).trim() || "Canal",
        group: attrs["group-title"] || "Outros",
        logo: attrs["tvg-logo"],
        epgId: attrs["tvg-id"],
      };
    } else if (line && !line.startsWith("#") && pending) {
      try {
        const url = new URL(line, base);
        if (["http:", "https:"].includes(url.protocol))
          channels.push({
            ...pending,
            id: pending.epgId || url.href,
            url: url.href,
          });
      } catch {}
      pending = null;
    }
  }
  return channels;
}
export interface Programme {
  channel: string;
  title: string;
  start: number;
  stop: number;
  description: string;
}
export function parseXMLTV(text: string): Programme[] {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror"))
    throw new Error("O guia XMLTV não é válido.");
  function date(s: string | null) {
    if (!s) return NaN;
    const m = s.match(
      /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/,
    );
    return m
      ? Date.parse(
          `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? m[7].slice(0, 3) + ":" + m[7].slice(3) : "Z"}`,
        )
      : NaN;
  }
  return [...xml.querySelectorAll("programme")]
    .map((p) => ({
      channel: p.getAttribute("channel") || "",
      title: p.querySelector("title")?.textContent || "",
      description: p.querySelector("desc")?.textContent || "",
      start: date(p.getAttribute("start")),
      stop: date(p.getAttribute("stop")),
    }))
    .filter((p) => Number.isFinite(p.start) && p.stop > p.start);
}
