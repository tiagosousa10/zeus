/** Weighted LRU. Weights are estimates, not a measurement of V8 heap usage. */
export class BoundedCache<T> {
  private entries = new Map<
    string,
    { value: T; expires: number; weight: number }
  >();
  private total = 0;
  constructor(
    private maxEntries: number,
    private maxWeight: number,
  ) {}
  get size() {
    return this.entries.size;
  }
  get weight() {
    return this.total;
  }
  private delete(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.total -= entry.weight;
    this.entries.delete(key);
  }
  get(key: string, now: number): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.expires <= now) {
      this.delete(key);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T, expires: number, weight: number) {
    this.delete(key);
    if (weight > this.maxWeight || this.maxEntries < 1) return;
    while (
      this.entries.size >= this.maxEntries ||
      this.total + weight > this.maxWeight
    ) {
      this.delete(this.entries.keys().next().value!);
    }
    this.entries.set(key, { value, expires, weight });
    this.total += weight;
  }
  prune(now: number) {
    for (const [key, entry] of this.entries)
      if (entry.expires <= now) this.delete(key);
  }
  clear() {
    this.entries.clear();
    this.total = 0;
  }
}

/** Count retained payloads without allocating a second, serialised copy. */
export function estimateSize(
  value: unknown,
  seen = new WeakSet<object>(),
): number {
  if (typeof value === "string") return value.length * 2 + 16;
  if (!value || typeof value !== "object") return 8;
  if (seen.has(value)) return 0;
  seen.add(value);
  let size = 64;
  if (value instanceof Map) {
    for (const [key, entry] of value)
      size += 32 + estimateSize(key, seen) + estimateSize(entry, seen);
  } else {
    for (const [key, entry] of Object.entries(value))
      size += 16 + key.length * 2 + estimateSize(entry, seen);
  }
  return size;
}
