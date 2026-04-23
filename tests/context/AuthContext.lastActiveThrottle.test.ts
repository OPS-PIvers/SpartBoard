import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldWriteLastActive,
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

describe('shouldWriteLastActive', () => {
  let storage: MemoryStorage;
  const uid = 'user-1';
  const orgId = 'orono';
  const t0 = Date.parse('2026-04-22T12:00:00.000Z');

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('writes on first call and stamps localStorage', () => {
    expect(shouldWriteLastActive(uid, orgId, t0, storage)).toBe(true);
    const stored = storage.getItem(lastActiveStorageKey(uid, orgId));
    expect(stored).toBe(new Date(t0).toISOString());
  });

  it('skips a second call within the throttle window', () => {
    expect(shouldWriteLastActive(uid, orgId, t0, storage)).toBe(true);
    const within = t0 + LAST_ACTIVE_THROTTLE_MS - 1;
    expect(shouldWriteLastActive(uid, orgId, within, storage)).toBe(false);
    // Stored timestamp should not have advanced.
    expect(storage.getItem(lastActiveStorageKey(uid, orgId))).toBe(
      new Date(t0).toISOString()
    );
  });

  it('writes again after the throttle window elapses', () => {
    expect(shouldWriteLastActive(uid, orgId, t0, storage)).toBe(true);
    const after = t0 + LAST_ACTIVE_THROTTLE_MS + 1;
    expect(shouldWriteLastActive(uid, orgId, after, storage)).toBe(true);
    expect(storage.getItem(lastActiveStorageKey(uid, orgId))).toBe(
      new Date(after).toISOString()
    );
  });

  it('falls back to writing when localStorage throws', () => {
    const throwing = new ThrowingStorage();
    expect(shouldWriteLastActive(uid, orgId, t0, throwing)).toBe(true);
    // Even on a "second" call within the window, throwing storage means we
    // cannot read prior state and must allow the caller's in-memory ref to
    // gate further writes.
    expect(shouldWriteLastActive(uid, orgId, t0 + 1000, throwing)).toBe(true);
  });

  it('falls back to writing when storage is null (SSR / unavailable)', () => {
    expect(shouldWriteLastActive(uid, orgId, t0, null)).toBe(true);
  });

  it('throttles per uid independently', () => {
    expect(shouldWriteLastActive('user-a', orgId, t0, storage)).toBe(true);
    // Different user, same window — should still write.
    expect(shouldWriteLastActive('user-b', orgId, t0, storage)).toBe(true);
    // Each user is now individually throttled.
    expect(shouldWriteLastActive('user-a', orgId, t0 + 1000, storage)).toBe(
      false
    );
    expect(shouldWriteLastActive('user-b', orgId, t0 + 1000, storage)).toBe(
      false
    );
  });

  it('throttles per orgId independently (org switch on same uid)', () => {
    expect(shouldWriteLastActive(uid, 'orono', t0, storage)).toBe(true);
    expect(shouldWriteLastActive(uid, 'other-org', t0, storage)).toBe(true);
    expect(shouldWriteLastActive(uid, 'orono', t0 + 1000, storage)).toBe(false);
  });
});
