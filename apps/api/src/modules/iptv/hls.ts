const PLAYLIST_TAG = /^#EXT-X-(MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/i;

// Fails closed: comments and any tag still holding a URL after rewriting are dropped, so nothing upstream leaks.
export function rewritePlaylist(
  text: string,
  base: string,
  link: (absoluteUrl: string, playlist: boolean) => string,
): string {
  const absolute = (uri: string, playlist: boolean) => link(new URL(uri, base).href, playlist);
  const out: string[] = [];
  let variantNext = false;
  for (const line of text.split("\n")) {
    const cr = line.endsWith("\r") ? "\r" : "";
    const value = line.slice(0, line.length - cr.length).trim();
    if (!value) {
      out.push(line);
    } else if (!value.startsWith("#")) {
      out.push(absolute(value, variantNext) + cr);
      variantNext = false;
    } else if (/^#EXT/i.test(value)) {
      const playlist = PLAYLIST_TAG.test(value);
      const tag = value.replace(
        /URI=(?:"([^"]*)"|([^,\s]*))/gi,
        (_, quoted: string | undefined, bare: string | undefined) => `URI="${absolute(quoted ?? bare ?? "", playlist)}"`,
      );
      if (tag.includes("://")) continue;
      if (/^#EXT-X-STREAM-INF:/i.test(value)) variantNext = true;
      out.push(tag + cr);
    }
  }
  return out.join("\n");
}
