import test from "node:test";
import assert from "node:assert/strict";
import { BoundedCache, estimateSize } from "../src/lib/bounded-cache.js";

test("cache evicts least recently used entries within entry and weight budgets", () => {
  const cache = new BoundedCache<string>(2, 10);
  cache.set("a", "A", 100, 4);
  cache.set("b", "B", 100, 4);
  assert.equal(cache.get("a", 0), "A");
  cache.set("c", "C", 100, 4);
  assert.equal(cache.get("b", 0), undefined);
  assert.equal(cache.get("a", 0), "A");
  cache.set("large", "L", 100, 9);
  assert.equal(cache.get("c", 0), undefined);
  assert.equal(cache.get("large", 0), "L");
  cache.set("oversize", "X", 100, 11);
  assert.equal(cache.get("oversize", 0), undefined);
  assert.equal(cache.get("large", 0), "L");
});
test("idle expiry releases entries and replacement/clear recover the weight budget", () => {
  const cache = new BoundedCache<string>(3, 10);
  cache.set("a", "old", 10, 8);
  cache.set("a", "new", 20, 2);
  cache.set("b", "B", 10, 8);
  cache.prune(10);
  assert.equal(cache.size, 1);
  assert.equal(cache.weight, 2);
  assert.equal(cache.get("a", 20), undefined);
  assert.equal(cache.weight, 0);
  cache.set("c", "C", 30, 10);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.weight, 0);
});
test("weight estimation includes Map programme payloads and shared objects only once", () => {
  const programme = { title: "Programa", description: "x".repeat(1000) };
  const map = new Map([["channel", [programme]]]);
  assert.ok(estimateSize(map) > 2000);
  assert.ok(
    estimateSize([programme, programme]) <
      estimateSize([programme, { ...programme }]),
  );
});
