import { describe, it, expect, beforeEach } from 'vitest';
import {
  canWriteLastActive,
  stampLastActive,
  lastActiveStorageKey,
  LAST_ACTIVE_THROTTLE_MS,
} from '@/utils/lastActiveThrottle';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

class ThrowingStorage implements Storage {
  get length(): number {
    return 0;
  }
  clear(): void {
    throw new Error('localStorage unavailable');
  }
  getItem(): string | null {
    throw new Error('localStorage unavailable');
  }
  key(): string | null {
    return null;
  }
  removeItem(): void {
    throw new Error('localStorage unavailable');
  }
  setItem(): void {
    throw new Error('localStorage unavailable');
  }
}

describe('canWriteLastActive / stampLastActive', () => {
  let storage: MemoryStorage;
  const uid = 'user-1';
  const orgId = 'orono';
  const t0 = Date.parse('2026-04-22T12:00:00.000Z');

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('allows the first write; stampLastActive records the timestamp', () => {
    expect(canWriteLastActive(uid, orgId, t0, storage)).toBe(true);
    // Critical: check alone must NOT stamp — callers stamp only on success.
    expect(storage.getItem(lastActiveStorageKey(uid, orgId))).toBeNull();
    stampLastActive(uid, orgId, t0, storage);
    expect(storage.getItem(lastActiveStorageKey(uid, orgId))).toBe(
      new Date(t0).toISOString()
    );
  });

  it('blocks a second write within the throttle window once stamped', () => {
    stampLastActive(uid, orgId, t0, storage);
    const within = t0 + LAST_ACTIVE_THROTTLE_MS - 1;
    expect(canWriteLastActive(uid, orgId, within, storage)).toBe(false);
  });

  it('allows a retry after a failed write (no stamp)', () => {
    // Simulate: canWriteLastActive returned true, Firestore write failed,
    // caller did NOT call stampLastActive. Next call in the same window
    // should still allow the write — this is the exact behavior the
    // previous eager-stamp implementation got wrong.
    expect(canWriteLastActive(uid, orgId, t0, storage)).toBe(true);
    expect(canWriteLastActive(uid, orgId, t0 + 1000, storage)).toBe(true);
  });

  it('allows a write again after the throttle window elapses', () => {
    stampLastActive(uid, orgId, t0, storage);
    const after = t0 + LAST_ACTIVE_THROTTLE_MS + 1;
    expect(canWriteLastActive(uid, orgId, after, storage)).toBe(true);
  });

  it('falls back to allowing writes when localStorage throws', () => {
    const throwing = new ThrowingStorage();
    expect(canWriteLastActive(uid, orgId, t0, throwing)).toBe(true);
    // stampLastActive must not propagate the throw.
    expect(() => stampLastActive(uid, orgId, t0, throwing)).not.toThrow();
    expect(canWriteLastActive(uid, orgId, t0 + 1000, throwing)).toBe(true);
  });

  it('falls back to allowing writes when storage is null (SSR / unavailable)', () => {
    expect(canWriteLastActive(uid, orgId, t0, null)).toBe(true);
    expect(() => stampLastActive(uid, orgId, t0, null)).not.toThrow();
  });

  it('throttles per uid independently', () => {
    stampLastActive('user-a', orgId, t0, storage);
    stampLastActive('user-b', orgId, t0, storage);
    expect(canWriteLastActive('user-a', orgId, t0 + 1000, storage)).toBe(false);
    expect(canWriteLastActive('user-b', orgId, t0 + 1000, storage)).toBe(false);
    expect(canWriteLastActive('user-c', orgId, t0 + 1000, storage)).toBe(true);
  });

  it('throttles per orgId independently (org switch on same uid)', () => {
    stampLastActive(uid, 'orono', t0, storage);
    expect(canWriteLastActive(uid, 'orono', t0 + 1000, storage)).toBe(false);
    // Switching orgs inside the window must still allow a fresh write for
    // the new org — otherwise the new org's member doc never gets stamped.
    expect(canWriteLastActive(uid, 'other-org', t0 + 1000, storage)).toBe(true);
  });
});
