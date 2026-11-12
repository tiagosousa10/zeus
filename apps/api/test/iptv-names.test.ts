import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFolderName, detectCountry, isAdult, channelTags } from "../src/modules/iptv/names.js";

test("folder names lose decorations and shouting", () => {
  assert.equal(cleanFolderName("★●· PORTUGAL ●·★"), "Portugal");
  assert.equal(cleanFolderName("  Exclusivos  "), "Exclusivos");
  assert.equal(cleanFolderName("|| SPORT TV ||"), "Sport TV");
  assert.equal(cleanFolderName("HBO"), "HBO");
  assert.equal(cleanFolderName("4K UHD"), "4K UHD");
  assert.equal(cleanFolderName("★★★"), "★★★");
});
test("country detection in PT, EN, ES and FR", () => {
  for (const [name, code] of [
    ["Portugal", "PT"], ["Brasil", "BR"], ["Brazil", "BR"], ["Spain", "ES"], ["Espanha", "ES"],
    ["França", "FR"], ["France", "FR"], ["Bélgica", "BE"], ["Belgium", "BE"], ["Holanda", "NL"], ["Netherlands", "NL"],
  ]) assert.equal(detectCountry(name), code, name);
  assert.equal(detectCountry("Exclusivos"), undefined);
  assert.equal(detectCountry("Portugal Low"), "PT");
});
test("adult terms are detected as words", () => {
  for (const n of ["ADULTOS", "For Adults", "XXX Gold", "Canal 18+", "+18 Noite", "Porn Hub"]) assert.equal(isAdult(n), true, n);
  for (const n of ["Notícias 24", "Desporto", "Sexta-feira 13", "Adultério (filme)"]) assert.equal(isAdult(n), false, n);
});
test("channel tags derive from channel names", () => {
  assert.deepEqual(channelTags("RTP1 HD"), ["HD"]);
  assert.deepEqual(channelTags("SPORT TV 1 FHD"), ["FHD/4K", "Desporto"]);
  assert.deepEqual(channelTags("Canal 4K UHD"), ["FHD/4K"]);
  assert.deepEqual(channelTags("CNN Portugal"), ["Notícias"]);
  assert.deepEqual(channelTags("Panda Kids"), ["Infantis"]);
  assert.deepEqual(channelTags("RTP2"), []);
});
