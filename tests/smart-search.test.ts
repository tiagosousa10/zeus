import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearch, matchScore } from "../apps/web/src/lib/smart-search";
test("search understands Portuguese types, genres, years and quoted exact titles", () => {
  assert.deepEqual(parseSearch("filmes ação 2024"), {
    text: "",
    kind: "movie",
    module: "",
    year: "2024",
    genre: "Action",
  });
  assert.equal(parseSearch("canais Portugal").kind, "live");
  assert.equal(parseSearch("canais Portugal").text, "portugal");
  assert.equal(parseSearch('"Cinema Paradiso"').text, "Cinema Paradiso");
  assert.equal(parseSearch("1917").text, "1917");
});
test("local search matches category, accents, unordered tokens and minor spelling errors", () => {
  assert.ok(matchScore("RTP 1", "Portugal", parseSearch("canais Portugal")));
  assert.ok(
    matchScore("Missão Impossível", "Ação", parseSearch("imposivel missao")),
  );
  assert.equal(
    matchScore("Canal 1", "Brasil", parseSearch("canais Portugal")),
    0,
  );
  assert.equal(
    matchScore("Filme (2023)", "Ação", parseSearch("filmes ação 2024")),
    0,
  );
});
