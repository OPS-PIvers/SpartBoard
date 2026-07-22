import { describe, it, expect, vi } from 'vitest';
import {
  canWriteLastActive,
  stampLastActive,
  lastActiveStorageKey,
  LAST_ACTIVE_THROTTLE_MS,
} from '@/utils/lastActiveThrottle';

/**
 * Throttles the per-member `lastActive` self-write to once per hour per
 * browser. `canWriteLastActive` is a read-only "is a write due?" check;
 * `stampLastActive` records a successful write. Both take an injectable
 * `storage` so they can be exercised with an in-memory mock rather than
 * the real localStorage.
 */

// Minimal in-memory Storage stand-in for the injectable `storage` argument.
function makeStore(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const UID = 'user-1';
const ORG = 'org-1';
const KEY = lastActiveStorageKey(UID, ORG);

describe('lastActiveThrottle', () => {
  it('exposes a one-hour throttle window constant', () => {
    expect(LAST_ACTIVE_THROTTLE_MS).toBe(60 * 60 * 1000);
  });

  it('namespaces the storage key by uid and orgId', () => {
    expect(lastActiveStorageKey(UID, ORG)).toBe(
      'spart:lastActive:user-1:org-1'
    );
    // Different (uid, orgId) tuples never collide.
    expect(lastActiveStorageKey('a', 'b')).not.toBe(
      lastActiveStorageKey('a', 'c')
    );
  });

  describe('canWriteLastActive', () => {
    it('returns true when no prior stamp exists', () => {
      const store = makeStore();
      expect(canWriteLastActive(UID, ORG, Date.now(), store)).toBe(true);
    });

    it('returns false within the throttle window', () => {
      const now = 1_000_000_000_000;
      const store = makeStore({ [KEY]: new Date(now).toISOString() });
      // 59 minutes later — still inside the 1h window.
      expect(canWriteLastActive(UID, ORG, now + 59 * 60 * 1000, store)).toBe(
        false
      );
    });

    it('returns true once the throttle window has elapsed', () => {
      const now = 1_000_000_000_000;
      const store = makeStore({ [KEY]: new Date(now).toISOString() });
      // Exactly one hour later — write is due again (>= comparison).
      expect(canWriteLastActive(UID, ORG, now + 60 * 60 * 1000, store)).toBe(
        true
      );
    });

    it('returns true when the stored timestamp is unparseable', () => {
      const store = makeStore({ [KEY]: 'not-a-date' });
      expect(canWriteLastActive(UID, ORG, Date.now(), store)).toBe(true);
    });

    it('returns true (fail-open) when storage is explicitly null', () => {
      expect(canWriteLastActive(UID, ORG, Date.now(), null)).toBe(true);
    });

    it('returns true when getItem throws (private mode / quota)', () => {
      const throwing = {
        getItem: () => {
          throw new Error('SecurityError');
        },
      } as unknown as Storage;
      expect(canWriteLastActive(UID, ORG, Date.now(), throwing)).toBe(true);
    });
  });

  describe('stampLastActive', () => {
    it('records an ISO timestamp that later suppresses a write', () => {
      const now = 1_000_000_000_000;
      const store = makeStore();
      stampLastActive(UID, ORG, now, store);
      expect(store.getItem(KEY)).toBe(new Date(now).toISOString());
      // The just-stamped value blocks an immediate re-write.
      expect(canWriteLastActive(UID, ORG, now, store)).toBe(false);
    });

    it('silently no-ops when storage is null', () => {
      expect(() => stampLastActive(UID, ORG, Date.now(), null)).not.toThrow();
    });

    it('silently swallows a setItem that throws', () => {
      const throwing = {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      } as unknown as Storage;
      expect(() =>
        stampLastActive(UID, ORG, Date.now(), throwing)
      ).not.toThrow();
    });

    it('round-trips through canWriteLastActive across the window boundary', () => {
      const store = makeStore();
      const t0 = 1_700_000_000_000;
      stampLastActive(UID, ORG, t0, store);
      expect(canWriteLastActive(UID, ORG, t0 + 30 * 60 * 1000, store)).toBe(
        false
      );
      expect(canWriteLastActive(UID, ORG, t0 + 60 * 60 * 1000, store)).toBe(
        true
      );
    });
  });

  it('falls back to real localStorage when storage arg is omitted', () => {
    // When `storage` is undefined, the helper resolves to the ambient
    // localStorage (jsdom provides one). Exercise that default path.
    const spy = vi.spyOn(Storage.prototype, 'getItem');
    canWriteLastActive(UID, ORG, Date.now());
    expect(spy).toHaveBeenCalledWith(KEY);
    spy.mockRestore();
  });
});
