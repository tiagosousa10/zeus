export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export type SearchIntent = {
  text: string;
  kind: "" | "live" | "movie" | "series";
  module: "" | "cinema" | "tv";
  year: string;
  genre: string;
};
const genres: Record<string, string> = {
  acao: "Action",
  aventura: "Adventure",
  animacao: "Animation",
  comedia: "Comedy",
  crime: "Crime",
  documentario: "Documentary",
  drama: "Drama",
  familia: "Family",
  fantasia: "Fantasy",
  terror: "Horror",
  romance: "Romance",
  thriller: "Thriller",
};
export function parseSearch(value: string): SearchIntent {
  const intent: SearchIntent = {
    text: "",
    kind: "",
    module: "",
    year: "",
    genre: "",
  };
  // Quotes explicitly preserve titles such as "Cinema Paradiso" or "1917".
  if (/^".+"$/.test(value.trim()))
    return { ...intent, text: value.trim().slice(1, -1) };
  const words = fold(value).split(" "),
    title: string[] = [];
  for (const w of words) {
    if (["filmes", "filme", "movies"].includes(w)) intent.kind = "movie";
    else if (["series", "serie"].includes(w)) intent.kind = "series";
    else if (["canais", "canal", "direto"].includes(w)) intent.kind = "live";
    else if (w === "cinema" || w === "tv") intent.module = w;
    else if (/^(19|20)\d{2}$/.test(w) && words.length > 1) intent.year = w;
    else if (genres[w] && (intent.kind || words.length > 1))
      intent.genre = genres[w];
    else if (!["de", "do", "da", "em", "no", "na"].includes(w)) title.push(w);
  }
  intent.text = title.join(" ");
  return intent;
}
function near(a: string, b: string) {
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    errors = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++errors > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return errors + (a.length - i) + (b.length - j) <= 1;
}
export function matchScore(
  name: string,
  category: string,
  intent: SearchIntent,
) {
  const n = fold(name),
    all = fold(name + " " + category),
    words = all.split(" "),
    tokens = fold(intent.text).split(" ").filter(Boolean);
  if (intent.year && !new RegExp(`\\b${intent.year}\\b`).test(all)) return 0;
  if (
    intent.genre &&
    !all.includes(fold(intent.genre)) &&
    !Object.entries(genres).some(
      ([pt, en]) => en === intent.genre && all.includes(pt),
    )
  )
    return 0;
  if (!tokens.length) return 1;
  if (n === intent.text) return 100;
  if (n.includes(intent.text)) return 80;
  return tokens.every((t) => all.includes(t))
    ? 60
    : tokens.every((t) => words.some((w) => w.includes(t) || near(t, w)))
      ? 30
      : 0;
}
