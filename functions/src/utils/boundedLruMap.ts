/**
 * Fixed-capacity LRU cache backed by a `Map`.
 *
 * `Map` preserves insertion order, so the least-recently-used entry is always
 * the first key. On a hit, the entry is deleted and re-inserted so it moves
 * to the most-recently-used position. On insertion at capacity, the first
 * key (oldest by recency) is evicted.
 *
 * Intended for small, mostly read-hot caches inside a single warm Cloud
 * Functions instance — admin-status lookups, per-instance pseudonym keys,
 * etc. Not safe for concurrent mutation across async boundaries; callers
 * that interleave async reads must accept that a stale entry may briefly
 * coexist with an in-flight refresh.
 */
export class BoundedLruMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new Error('BoundedLruMap maxSize must be a positive integer');
    }
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }
    const value = this.map.get(key) as V;
    // Promote to most-recently-used by re-inserting at the tail.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Use the iterator's `done` sentinel rather than checking the key
      // for `undefined`, so eviction still fires when `K = undefined` is
      // a legal key in the map.
      const { value: oldest, done } = this.map.keys().next();
      if (!done) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
