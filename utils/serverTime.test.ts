import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUnsub = vi.fn();
let onSnapshotCallback:
  | ((snap: {
      metadata: { hasPendingWrites: boolean };
      data: () => { at?: { toMillis: () => number } } | undefined;
    }) => void)
  | null = null;

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  onSnapshot: vi.fn(
    (
      _ref: unknown,
      _opts: unknown,
      cb: (snap: {
        metadata: { hasPendingWrites: boolean };
        data: () => { at?: { toMillis: () => number } } | undefined;
      }) => void
    ) => {
      onSnapshotCallback = cb;
      return mockUnsub;
    }
  ),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

import {
  getServerNow,
  syncServerTime,
  __resetServerTimeSyncForTests,
} from './serverTime';

describe('serverTime', () => {
  beforeEach(() => {
    __resetServerTimeSyncForTests();
    onSnapshotCallback = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getServerNow defaults to Date.now() before any sync resolves', () => {
    const before = Date.now();
    const now = getServerNow();
    expect(now).toBeGreaterThanOrEqual(before);
  });

  it('applies the offset once the serverTimestamp round-trip resolves', () => {
    syncServerTime('uid-1');
    expect(onSnapshotCallback).not.toBeNull();

    const serverMillis = Date.now() + 10_000; // server is 10s ahead
    onSnapshotCallback?.({
      metadata: { hasPendingWrites: false },
      data: () => ({ at: { toMillis: () => serverMillis } }),
    });

    const now = getServerNow();
    expect(Math.abs(now - serverMillis)).toBeLessThan(1000);
  });

  it('ignores a pending-write snapshot (the local optimistic estimate)', () => {
    syncServerTime('uid-2');
    const before = getServerNow();
    onSnapshotCallback?.({
      metadata: { hasPendingWrites: true },
      data: () => ({ at: { toMillis: () => Date.now() + 999_999 } }),
    });
    expect(Math.abs(getServerNow() - before)).toBeLessThan(1000);
  });

  it('is a no-op for a falsy uid', () => {
    syncServerTime(null);
    syncServerTime(undefined);
    syncServerTime('');
    expect(onSnapshotCallback).toBeNull();
  });
});
