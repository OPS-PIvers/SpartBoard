// Phase 5 — dedupes Drive set loads so card-select prefetch makes Play instant.
export class SetPrefetchCache<T> {
  private cache = new Map<string, Promise<T>>();

  // Returns the cached in-flight/settled promise or starts a new fetch.
  // Rejected fetches are evicted so the next call retries fresh.
  async fetch(setId: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(setId);
    if (cached) {
      try {
        return await cached;
      } catch {
        this.cache.delete(setId);
      }
    }
    const promise = fetcher();
    this.cache.set(setId, promise);
    try {
      return await promise;
    } catch (err) {
      // Only evict if a newer fetch hasn't replaced this entry.
      if (this.cache.get(setId) === promise) this.cache.delete(setId);
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
