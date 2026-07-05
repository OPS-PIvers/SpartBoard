import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { collection, doc, getDoc, onSnapshot, where } from 'firebase/firestore';
import { logError } from '@/utils/logError';
import {
  useSubstituteShares,
  useSubstituteShare,
  useSubstituteCollectionBoard,
} from '@/hooks/useSubstituteShares';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((_ref: unknown, ...constraints: unknown[]) => ({
    __query: constraints,
  })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: { field, op, value },
  })),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWhere = where as Mock;
const mockLogError = logError as Mock;

// onSnapshot handler capture: each subscription pushes its
// { next, error, unsub } so individual tests can drive the
// success/error callback of a specific listener and assert teardown.
interface Listener {
  next: (snap: unknown) => void;
  error: (err: { code?: string; message?: string }) => void;
  unsub: Mock;
}
let listeners: Listener[];

function lastListener(): Listener {
  return listeners[listeners.length - 1];
}

// Fake collection snapshot: hook reads `snap.docs.forEach`, each doc
// exposing `id` and a `data()` getter.
const fakeCollSnap = (
  docs: Array<{ id: string; data: Record<string, unknown> }>
) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});

// Fake single-doc snapshot: hook reads `snap.exists()`, `snap.data()`,
// `snap.id`.
const fakeDocSnap = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  listeners = [];
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockOnSnapshot.mockImplementation(
    (
      _ref: unknown,
      next: (snap: unknown) => void,
      error: (err: { code?: string; message?: string }) => void
    ) => {
      const unsub = vi.fn();
      listeners.push({ next, error, unsub });
      return unsub;
    }
  );
});

afterEach(() => {
  // Restores the vi.spyOn(Date, 'now') spies used in several cases —
  // clearAllMocks (beforeEach) resets call data but not implementations.
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// useSubstituteShares(buildingId)
// ---------------------------------------------------------------------------

describe('useSubstituteShares — listener wiring', () => {
  it('queries shared_boards filtered to substitute mode + canonical building, loading until first snapshot', () => {
    const { result } = renderHook(() => useSubstituteShares('high'));

    expect(result.current).toEqual({ shares: [], loading: true, error: null });
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'shared_boards'
    );
    expect(mockWhere).toHaveBeenCalledWith('intendedMode', '==', 'substitute');
    expect(mockWhere).toHaveBeenCalledWith('buildingId', '==', 'high');
    expect(listeners).toHaveLength(1);
  });

  it('includes an expiresAt > now query constraint so the read rule can be proven for the whole query (#2150)', () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    renderHook(() => useSubstituteShares('high'));

    expect(mockWhere).toHaveBeenCalledWith('expiresAt', '>', now);
  });

  it('canonicalizes a legacy building ID before scoping the query', () => {
    renderHook(() => useSubstituteShares('orono-high-school'));

    // canonicalBuildingId('orono-high-school') === 'high'
    expect(mockWhere).toHaveBeenCalledWith('buildingId', '==', 'high');
  });

  it('does not subscribe and reports not-loading when buildingId is empty', () => {
    const { result } = renderHook(() => useSubstituteShares(''));

    expect(result.current).toEqual({ shares: [], loading: false, error: null });
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

describe('useSubstituteShares — snapshot mapping', () => {
  it('maps docs, carries shareId from doc.id, and filters out expired shares', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { result } = renderHook(() => useSubstituteShares('high'));
    act(() => {
      lastListener().next(
        fakeCollSnap([
          { id: 'live', data: { expiresAt: now + 1000, sharedAt: 5 } },
          { id: 'expired', data: { expiresAt: now - 1000, sharedAt: 9 } },
          { id: 'exact', data: { expiresAt: now, sharedAt: 9 } }, // <= now, dropped
        ])
      );
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.shares).toHaveLength(1);
    expect(result.current.shares[0].shareId).toBe('live');
  });

  it('treats a missing or non-numeric expiresAt as already expired', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { result } = renderHook(() => useSubstituteShares('high'));
    act(() => {
      lastListener().next(
        fakeCollSnap([
          { id: 'no-expiry', data: { sharedAt: 1 } },
          { id: 'string-expiry', data: { expiresAt: 'soon', sharedAt: 2 } },
        ])
      );
    });

    expect(result.current.shares).toEqual([]);
  });

  it('sorts surviving shares by sharedAt descending', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { result } = renderHook(() => useSubstituteShares('high'));
    act(() => {
      lastListener().next(
        fakeCollSnap([
          { id: 'a', data: { expiresAt: now + 1, sharedAt: 100 } },
          { id: 'b', data: { expiresAt: now + 1, sharedAt: 300 } },
          { id: 'c', data: { expiresAt: now + 1, sharedAt: 200 } },
        ])
      );
    });

    expect(result.current.shares.map((s) => s.shareId)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('orders shares with a missing sharedAt last (treated as 0)', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { result } = renderHook(() => useSubstituteShares('high'));
    act(() => {
      lastListener().next(
        fakeCollSnap([
          { id: 'no-shared-at', data: { expiresAt: now + 1 } },
          { id: 'has-shared-at', data: { expiresAt: now + 1, sharedAt: 50 } },
        ])
      );
    });

    expect(result.current.shares.map((s) => s.shareId)).toEqual([
      'has-shared-at',
      'no-shared-at',
    ]);
  });
});

describe('useSubstituteShares — error handling', () => {
  it('re-subscribes (does not surface an error) on the first few permission-denied hits', () => {
    // Regression (#2150 follow-up): a share expiring WHILE this listener is
    // open, followed by expireSubShares.ts writing to it, denies the WHOLE
    // query with permission-denied (confirmed against the real emulator) —
    // not just a per-doc removal. Re-subscribing with a fresh Date.now()
    // baseline (which excludes the now-expired doc) recovers transparently
    // instead of parking the directory listing in a hard error state.
    const { result } = renderHook(() => useSubstituteShares('high'));
    expect(listeners).toHaveLength(1);

    act(() => {
      lastListener().error({ code: 'permission-denied' });
    });
    expect(listeners).toHaveLength(2); // re-subscribed
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    // Expiry-driven reconnects are expected and transparent — don't log them
    // as errors (would trip error-dashboard rate limits for routine expiry).
    expect(mockLogError).not.toHaveBeenCalled();

    act(() => {
      lastListener().next(fakeCollSnap([]));
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('gives up and surfaces the friendly message after repeated permission-denied hits', () => {
    const { result } = renderHook(() => useSubstituteShares('high'));

    for (let i = 0; i < 4; i++) {
      act(() => {
        lastListener().error({ code: 'permission-denied' });
      });
    }

    expect(result.current).toEqual({
      shares: [],
      loading: false,
      error: 'You do not have permission to view this board.',
    });
    expect(listeners.length).toBeLessThanOrEqual(5);
    // Only the final, exhausted attempt should be logged — not the 3
    // retried ones.
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(
      'useSubstituteShares.snapshot',
      { code: 'permission-denied' },
      { buildingId: 'high' }
    );
  });

  it('resets the retry count after a successful snapshot', () => {
    const { result } = renderHook(() => useSubstituteShares('high'));

    act(() => {
      lastListener().error({ code: 'permission-denied' });
    });
    expect(listeners).toHaveLength(2);
    act(() => {
      lastListener().next(fakeCollSnap([]));
    });
    // The retry count reset lives in a ref, not state, so a successful
    // snapshot must NOT tear down and rebuild the just-recovered listener.
    expect(listeners).toHaveLength(2);

    // Three more denials after a successful recovery should NOT immediately
    // exhaust retries (the counter reset on the intervening success) — the
    // last known-good (empty) shares list stays shown rather than flipping
    // back to a loading spinner or an error on every transient re-subscribe.
    for (let i = 0; i < 3; i++) {
      act(() => {
        lastListener().error({ code: 'permission-denied' });
      });
    }

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.shares).toEqual([]);
  });

  it('falls back to a generic message for an unknown error code', () => {
    const { result } = renderHook(() => useSubstituteShares('high'));
    act(() => {
      lastListener().error({ code: 'internal' });
    });

    expect(result.current.error).toBe('This board could not be loaded.');
  });

  it('logs the canonical building ID (not the raw input) in the error context', () => {
    renderHook(() => useSubstituteShares('orono-high-school'));
    // A non-retryable code so this hits logError immediately rather than
    // entering the permission-denied retry path.
    act(() => {
      lastListener().error({ code: 'unavailable' });
    });

    // canonicalBuildingId('orono-high-school') === 'high'
    expect(mockLogError).toHaveBeenCalledWith(
      'useSubstituteShares.snapshot',
      { code: 'unavailable' },
      { buildingId: 'high' }
    );
  });
});

describe('useSubstituteShares — building change & cleanup', () => {
  it('tears down the prior listener and re-enters loading when the building changes', () => {
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { result, rerender } = renderHook(
      ({ b }: { b: string }) => useSubstituteShares(b),
      { initialProps: { b: 'high' } }
    );
    act(() => {
      lastListener().next(
        fakeCollSnap([{ id: 'x', data: { expiresAt: now + 1, sharedAt: 1 } }])
      );
    });
    expect(result.current.loading).toBe(false);

    const firstUnsub = listeners[0].unsub;
    rerender({ b: 'middle' });

    // Old listener torn down; stale snapshot building !== new canonical, so loading.
    expect(firstUnsub).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ shares: [], loading: true, error: null });
    expect(mockWhere).toHaveBeenCalledWith('buildingId', '==', 'middle');
    expect(listeners).toHaveLength(2);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useSubstituteShares('high'));
    const unsub = listeners[0].unsub;
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('gives a fresh retry budget to a new building instead of carrying over a depleted one', () => {
    // Regression: retryCountRef must reset when buildingId changes, not just
    // on a successful snapshot — otherwise a building with partial retries
    // "poisons" the next building's listener with a depleted retry budget.
    const { result, rerender } = renderHook(
      ({ b }: { b: string }) => useSubstituteShares(b),
      { initialProps: { b: 'high' } }
    );

    // Exhaust 2 of 3 retries on 'high' without ever succeeding.
    act(() => {
      lastListener().error({ code: 'permission-denied' });
    });
    act(() => {
      lastListener().error({ code: 'permission-denied' });
    });
    expect(listeners).toHaveLength(3);

    rerender({ b: 'middle' });
    expect(listeners).toHaveLength(4);

    // 'middle' should get the full retry budget (3), not carry over 'high's
    // depleted count (2 already used).
    act(() => {
      lastListener().error({ code: 'permission-denied' });
    });
    act(() => {
      lastListener().error({ code: 'permission-denied' });
    });
    act(() => {
      lastListener().error({ code: 'permission-denied' });
    });
    expect(listeners).toHaveLength(7);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useSubstituteShare(shareId)
// ---------------------------------------------------------------------------

describe('useSubstituteShare — single-doc subscription', () => {
  it('does not subscribe and reports not-loading when shareId is null', () => {
    const { result } = renderHook(() => useSubstituteShare(null, 'high'));

    expect(result.current).toEqual({
      share: null,
      loading: false,
      error: null,
      permissionDeniedLikelyExpired: false,
    });
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('targets shared_boards/{shareId} and is loading until the first snapshot', () => {
    const { result } = renderHook(() => useSubstituteShare('s1', 'high'));

    expect(result.current).toEqual({
      share: null,
      loading: true,
      error: null,
      permissionDeniedLikelyExpired: false,
    });
    expect(mockDoc).toHaveBeenCalledWith(
      { __mock: 'db' },
      'shared_boards',
      's1'
    );
    expect(listeners).toHaveLength(1);
  });

  it('reports a "Share not found" error when the doc does not exist', () => {
    const { result } = renderHook(() => useSubstituteShare('s1', 'high'));
    act(() => {
      lastListener().next(fakeDocSnap('s1', null));
    });

    expect(result.current).toEqual({
      share: null,
      loading: false,
      error: 'Share not found',
      permissionDeniedLikelyExpired: false,
    });
  });

  it('rejects a doc whose intendedMode is not "substitute"', () => {
    const { result } = renderHook(() => useSubstituteShare('s1', 'high'));
    act(() => {
      lastListener().next(
        fakeDocSnap('s1', { intendedMode: 'copy', name: 'Board' })
      );
    });

    expect(result.current.share).toBeNull();
    expect(result.current.error).toBe('Not a substitute share');
  });

  it('maps a valid substitute doc and carries shareId from snap.id', () => {
    const { result } = renderHook(() => useSubstituteShare('s1', 'high'));
    act(() => {
      lastListener().next(
        fakeDocSnap('s1', {
          intendedMode: 'substitute',
          name: 'Sub Board',
          buildingId: 'high',
          widgets: [],
        })
      );
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.share).toMatchObject({
      shareId: 's1',
      name: 'Sub Board',
      intendedMode: 'substitute',
    });
  });

  it('rejects a substitute doc from a different building (cross-building gate)', () => {
    const { result } = renderHook(() => useSubstituteShare('s1', 'high'));
    act(() => {
      lastListener().next(
        fakeDocSnap('s1', {
          intendedMode: 'substitute',
          name: 'Other Building Board',
          buildingId: 'middle',
          widgets: [],
        })
      );
    });

    expect(result.current.share).toBeNull();
    expect(result.current.error).toBe(
      'This share is not available in your building.'
    );
  });

  it('rejects a substitute doc with no buildingId (fail closed)', () => {
    const { result } = renderHook(() => useSubstituteShare('s1', 'high'));
    act(() => {
      lastListener().next(
        fakeDocSnap('s1', {
          intendedMode: 'substitute',
          name: 'No Building Board',
          widgets: [],
        })
      );
    });

    expect(result.current.share).toBeNull();
    expect(result.current.error).toBe(
      'This share is not available in your building.'
    );
  });

  it('maps a listener error to a friendly message and logs it', () => {
    const { result } = renderHook(() => useSubstituteShare('s1', 'high'));
    act(() => {
      lastListener().error({ code: 'unavailable' });
    });

    expect(result.current).toEqual({
      share: null,
      loading: false,
      error: 'Could not reach the server. Check your internet connection.',
      permissionDeniedLikelyExpired: false,
    });
    expect(mockLogError).toHaveBeenCalledWith(
      'useSubstituteShare.snapshot',
      { code: 'unavailable' },
      { shareId: 's1' }
    );
  });

  it("flags permission-denied as likely-expired (the read rule's only other branches are host/admin, which never deny)", () => {
    const { result } = renderHook(() => useSubstituteShare('s1', 'high'));
    act(() => {
      lastListener().error({ code: 'permission-denied' });
    });

    expect(result.current).toEqual({
      share: null,
      loading: false,
      error: 'You do not have permission to view this board.',
      permissionDeniedLikelyExpired: true,
    });
  });

  it('tears down the prior listener and re-enters loading when shareId changes', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSubstituteShare(id, 'high'),
      { initialProps: { id: 's1' } }
    );
    act(() => {
      lastListener().next(
        fakeDocSnap('s1', {
          intendedMode: 'substitute',
          name: 'A',
          buildingId: 'high',
        })
      );
    });
    expect(result.current.loading).toBe(false);

    const firstUnsub = listeners[0].unsub;
    rerender({ id: 's2' });

    expect(firstUnsub).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({
      share: null,
      loading: true,
      error: null,
      permissionDeniedLikelyExpired: false,
    });
    expect(listeners).toHaveLength(2);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useSubstituteShare('s1', 'high'));
    const unsub = listeners[0].unsub;
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// useSubstituteCollectionBoard(shareId, boardId, expectedBuildingId)
// ---------------------------------------------------------------------------

describe('useSubstituteCollectionBoard — cross-building gate', () => {
  it('rejects a parent doc from a different building', async () => {
    mockGetDoc.mockResolvedValueOnce(
      fakeDocSnap('share1', {
        intendedMode: 'substitute',
        buildingId: 'middle',
        expiresAt: Date.now() + 60_000,
        boardIds: ['b1'],
      })
    );
    const { result } = renderHook(() =>
      useSubstituteCollectionBoard('share1', 'b1', 'high')
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.share).toBeNull();
    expect(result.current.error).toBe(
      'This share is not available in your building.'
    );
  });

  it('rejects a parent doc with no buildingId (fail closed)', async () => {
    mockGetDoc.mockResolvedValueOnce(
      fakeDocSnap('share1', {
        intendedMode: 'substitute',
        expiresAt: Date.now() + 60_000,
        boardIds: ['b1'],
      })
    );
    const { result } = renderHook(() =>
      useSubstituteCollectionBoard('share1', 'b1', 'high')
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.share).toBeNull();
    expect(result.current.error).toBe(
      'This share is not available in your building.'
    );
  });
});
