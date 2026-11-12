export type ChannelTag = "HD" | "FHD/4K" | "Notícias" | "Desporto" | "Infantis";

const plain = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const wordsRe = (terms: string[]) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.join("|")})(?![\\p{L}\\p{N}])`, "u");

export function cleanFolderName(raw: string): string {
  const trimmed = raw.trim();
  const cleaned = trimmed
    .replace(/^[^\p{L}\p{N}+()]+|[^\p{L}\p{N}+()]+$/gu, "")
    .replace(/\s+/g, " ");
  if (!cleaned) return trimmed;
  if (cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned
    .split(" ")
    .map((w) =>
      (w.match(/\p{L}/gu) ?? []).length > 3
        ? w.toLowerCase().replace(/\p{L}/u, (c) => c.toUpperCase())
        : w,
    )
    .join(" ");
}

const COUNTRIES: Record<string, string[]> = {
  PT: ["portugal"],
  BR: ["brasil", "brazil"],
  ES: ["spain", "espanha", "espana"],
  FR: ["franca", "france"],
  BE: ["belgica", "belgium"],
  NL: ["holanda", "netherlands"],
  GB: ["uk", "reino unido", "united kingdom"],
  IT: ["italia", "italy"],
  DE: ["alemanha", "germany"],
  US: ["eua", "usa", "united states"],
  CA: ["canada"],
  PL: ["polonia", "poland"],
  RO: ["romenia", "romania"],
  TR: ["turquia", "turkey"],
};

const COUNTRY_RES = Object.entries(COUNTRIES).map(
  ([code, names]) => [code, wordsRe(names)] as const,
);

export function detectCountry(name: string): string | undefined {
  const text = plain(name);
  return COUNTRY_RES.find(([, re]) => re.test(text))?.[0];
}

const ADULT_RE =
  /(?<![\p{L}\p{N}])(?:adult(?:s|os)?|for adults|xxx|porn\p{L}*|18\+|\+18)(?![\p{L}\p{N}])/iu;

export function isAdult(name: string): boolean {
  return ADULT_RE.test(name);
}

const HIGH_RES = wordsRe(["fhd", "4k", "uhd"]);
const HD_RE = wordsRe(["hd"]);
const NEWS_RE = wordsRe(["noticias", "news", "cnn", "informacao"]);
const SPORT_RE = wordsRe(["sport\\p{L}*", "desportos?", "deportes", "eleven", "dazn", "eurosport"]);
const KIDS_RE = wordsRe(["kids", "infantil", "infantis", "panda", "cartoon", "disney junior", "nick jr"]);

export function channelTags(name: string): ChannelTag[] {
  const text = plain(name);
  const tags: ChannelTag[] = [];
  if (HIGH_RES.test(text)) tags.push("FHD/4K");
  else if (HD_RE.test(text)) tags.push("HD");
  if (NEWS_RE.test(text)) tags.push("Notícias");
  if (SPORT_RE.test(text)) tags.push("Desporto");
  if (KIDS_RE.test(text)) tags.push("Infantis");
  return tags;
}
