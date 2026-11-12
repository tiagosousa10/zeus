export function rewritePlaylist(text: string, base: string, link: (absoluteUrl: string) => string): string {
  const absolute = (uri: string) => link(new URL(uri, base).href);
  return text
    .split("\n")
    .map((line) => {
      const cr = line.endsWith("\r") ? "\r" : "";
      const value = line.slice(0, line.length - cr.length).trim();
      if (!value) return line;
      if (value.startsWith("#")) return line.replace(/URI="([^"]*)"/g, (_, uri: string) => `URI="${absolute(uri)}"`);
      return absolute(value) + cr;
    })
    .join("\n");
}
