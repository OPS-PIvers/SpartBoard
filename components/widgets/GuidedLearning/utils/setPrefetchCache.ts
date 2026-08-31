// Phase 5 — dedupes Drive set loads so card-select prefetch makes Play instant.
interface CacheEntry<T> {
  version?: number;
  promise: Promise<T>;
}

export class SetPrefetchCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  // Returns the cached in-flight/settled promise or starts a new fetch.
  // A `version` mismatch (e.g. metadata updatedAt changed) forces a refetch.
  // Rejected fetches are evicted so the next call retries fresh.
  async fetch(
    setId: string,
    fetcher: () => Promise<T>,
    version?: number
  ): Promise<T> {
    const entry = this.cache.get(setId);
    if (entry && (version === undefined || entry.version === version)) {
      try {
        return await entry.promise;
      } catch {
        const current = this.cache.get(setId);
        // Only evict if a newer fetch hasn't replaced this entry.
        if (current === entry) this.cache.delete(setId);
        else if (current) return this.fetch(setId, fetcher, version);
      }
    }
    const next: CacheEntry<T> = { version, promise: fetcher() };
    this.cache.set(setId, next);
    try {
      return await next.promise;
    } catch (err) {
      if (this.cache.get(setId) === next) this.cache.delete(setId);
      throw err;
    }
  }

  invalidate(setId: string): void {
    this.cache.delete(setId);
  }

  has(setId: string): boolean {
    return this.cache.has(setId);
  }
}
