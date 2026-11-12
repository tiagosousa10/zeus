const PLAYLIST_TAG = /^#EXT-X-(MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/i;
const URI_ATTR = /URI=(?:"([^"]*)"|([^,\s]*))/gi;
// These point to JSON we would only relay raw, or (DEFINE) let the player build URLs we never see.
const DROPPED_TAG = /^#EXT-X-(CONTENT-STEERING|SESSION-DATA|DEFINE)\b/i;
// hls.js also breaks lines on a lone CR and on U+2028/U+2029.
const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/;
// Rewritten links never hold "//", a backslash, a "scheme:/" or a value starting with "/"; browsers read "\" as "/".
const POINTS_SOMEWHERE = /[/\\]{2}|\\|=\s*"?\s*[/\\]|[a-z][a-z0-9+.-]*:[/\\]/i;

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
  if (POINTS_SOMEWHERE.test(tag.replace(URI_ATTR, 'URI=""'))) return undefined;
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
  for (const line of text.split(LINE_BREAK)) {
    const value = line.trim();
    if (!value) {
      out.push("");
    } else if (!value.startsWith("#")) {
      const kind = next;
      next = "segment";
      const url = resolve(value, base);
      if (kind !== "skip" && url) out.push(link(url, kind === "playlist"));
    } else if (/^#EXT/i.test(value)) {
      const tag = rewriteTag(value, base, link);
      if (/^#EXT-X-STREAM-INF:/i.test(value)) next = tag === undefined ? "skip" : "playlist";
      if (tag !== undefined) out.push(tag);
    }
  }
  return out.join("\n");
}
