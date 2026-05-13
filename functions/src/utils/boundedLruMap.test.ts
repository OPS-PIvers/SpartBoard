import { describe, expect, it } from 'vitest';
import { BoundedLruMap } from './boundedLruMap';

describe('BoundedLruMap', () => {
  it('rejects non-positive or non-integer maxSize', () => {
    expect(() => new BoundedLruMap(0)).toThrow();
    expect(() => new BoundedLruMap(-1)).toThrow();
    expect(() => new BoundedLruMap(1.5)).toThrow();
  });

  it('returns undefined for missing keys', () => {
    const cache = new BoundedLruMap<string, number>(3);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('promotes on read so an old entry survives eviction', () => {
    const cache = new BoundedLruMap<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // Touch 'a' — promotes it to most-recently-used.
    expect(cache.get('a')).toBe(1);
    // Adding a fourth key now evicts the new oldest, 'b'.
    cache.set('d', 4);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('treats an explicit undefined value as a cache hit and promotes it', () => {
    // Guards against the FIFO-vs-LRU regression for generic V types: a
    // `get` for a key whose value is `undefined` must still promote the
    // entry, not behave as a cache miss.
    const cache = new BoundedLruMap<string, number | undefined>(3);
    cache.set('a', undefined);
    cache.set('b', 2);
    cache.set('c', 3);
    // Touch 'a' (value === undefined). Should promote it.
    expect(cache.get('a')).toBeUndefined();
    // Adding a fourth key now evicts 'b' (the new oldest) rather than 'a'.
    cache.set('d', 4);
    expect(cache.size).toBe(3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('evicts the oldest entry even when its key is undefined', () => {
    // Guards eviction logic for `K = undefined` legal keys: the previous
    // implementation skipped the delete branch if `oldest === undefined`,
    // letting the map grow past `maxSize`.
    const cache = new BoundedLruMap<string | undefined, number>(2);
    cache.set(undefined, 1);
    cache.set('b', 2);
    cache.set('c', 3); // should evict the `undefined` key
    expect(cache.size).toBe(2);
    expect(cache.get(undefined)).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('delete and clear behave as expected', () => {
    const cache = new BoundedLruMap<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
