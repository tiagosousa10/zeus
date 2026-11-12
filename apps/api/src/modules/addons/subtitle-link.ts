import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../lib/config.js";

const sign = (url: string) =>
  createHmac("sha256", config.authSecret)
    .update("subtitle:" + url)
    .digest("base64url");

// Só URLs devolvidos pelos Add-ons recebem assinatura, para o proxy não servir endereços arbitrários.
export function subtitleLink(url: string) {
  return `/api/subtitles/file?${new URLSearchParams({ url, sig: sign(url) })}`;
}

export function validSubtitleSignature(url: string, sig: string) {
  const expected = Buffer.from(sign(url));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
