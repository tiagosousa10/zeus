const PLAYLIST_TAG = /^#EXT-X-(MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/i;
const URI_ATTR = /URI=(?:"([^"]*)"|([^,\s]*))/gi;
// These point to JSON or other documents we would only ever relay raw.
const DROPPED_TAG = /^#EXT-X-(CONTENT-STEERING|SESSION-DATA)\b/i;

const resolve = (uri: string, base: string): string | undefined => {
  try {
    return new URL(uri, base).href;
  } catch {
    return undefined;
  }
};

function rewriteTag(value: string, base: string, link: (absoluteUrl: string, playlist: boolean) => string): string | undefined {
  if (DROPPED_TAG.test(value) || (/^#EXT-X-DATERANGE:/i.test(value) && /X-ASSET-/i.test(value))) return undefined;
  const tag = value.replace(/^(#EXTINF:[^,]*),.*$/i, "$1,");
  // Rewritten links never hold "//" or start an attribute value with "/", so anything left like that is upstream.
  if (/\/\/|=\s*"?\//.test(tag.replace(URI_ATTR, 'URI=""'))) return undefined;
  const uris = [...tag.matchAll(URI_ATTR)].map((m) => resolve(m[1] ?? m[2] ?? "", base));
  if (uris.some((u) => u === undefined)) return undefined;
  const playlist = PLAYLIST_TAG.test(tag);
  let i = 0;
  return tag.replace(URI_ATTR, () => `URI="${link(uris[i++]!, playlist)}"`);
}

// Fails closed: comments and any tag that could still carry an upstream location are dropped.
export function rewritePlaylist(
  text: string,
  base: string,
  link: (absoluteUrl: string, playlist: boolean) => string,
): string {
  const out: string[] = [];
  let next: "segment" | "playlist" | "skip" = "segment";
  for (const line of text.split("\n")) {
    const cr = line.endsWith("\r") ? "\r" : "";
    const value = line.slice(0, line.length - cr.length).trim();
    if (!value) {
      out.push(line);
    } else if (!value.startsWith("#")) {
      const kind = next;
      next = "segment";
      const url = resolve(value, base);
      if (kind !== "skip" && url) out.push(link(url, kind === "playlist") + cr);
    } else if (/^#EXT/i.test(value)) {
      const tag = rewriteTag(value, base, link);
      if (/^#EXT-X-STREAM-INF:/i.test(value)) next = tag === undefined ? "skip" : "playlist";
      if (tag !== undefined) out.push(tag + cr);
    }
  }
  return out.join("\n");
}
