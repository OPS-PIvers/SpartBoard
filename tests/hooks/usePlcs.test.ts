/**
 * Subscription-wiring tests for usePlcs.
 *
 * Focus: the admin read path added so the admin "push resource to specific
 * PLCs" picker can enumerate ALL PLCs, not just the ones the current admin
 * happens to be a member of.
 *
 * Mocking strategy mirrors usePlcAssignmentIndex.test.ts — firebase/firestore
 * is fully mocked so `query`/`collection`/`where` calls are observable, and
 * the snapshot callback is captured to drive the parser.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { usePlcs } from '@/hooks/usePlcs';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: { field, op, value },
  })),
  orderBy: vi.fn((field: string, dir?: string) => ({
    __orderBy: { field, dir },
  })),
  limit: vi.fn((n: number) => ({ __limit: n })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const useAuthMock = vi.fn<() => { user: { uid: string } | null }>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const mockCollection = collection as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockQuery = query as Mock;
const mockWhere = where as Mock;
const mockOrderBy = orderBy as Mock;
const mockLimit = limit as Mock;
const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;

const USER_UID = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  // Resolve collection refs to an addressable string so assertions can verify
  // which path the listener attached to.
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockOnSnapshot.mockReturnValue(() => undefined);
  useAuthMock.mockReturnValue({ user: { uid: USER_UID } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlcs - subscription wiring', () => {
  it('member mode (default) scopes the listen to memberUids array-contains uid', () => {
    renderHook(() => usePlcs());

    // The membership filter must be applied so a teacher only sees PLCs they
    // belong to.
    expect(mockWhere).toHaveBeenCalledWith(
      'memberUids',
      'array-contains',
      USER_UID
    );
    expect(mockQuery).toHaveBeenCalledWith('plcs', {
      __where: { field: 'memberUids', op: 'array-contains', value: USER_UID },
    });
    // Member mode is naturally bounded by membership — no extra limit/orderBy.
    expect(mockOrderBy).not.toHaveBeenCalled();
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it('admin mode subscribes to the WHOLE /plcs collection (no membership filter)', () => {
    renderHook(() => usePlcs({ asAdmin: true }));

    // Admins must enumerate every PLC regardless of membership — so NO
    // `where('memberUids', ...)` constraint may be applied.
    expect(mockWhere).not.toHaveBeenCalled();
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('admin mode bounds the whole-collection listen with limit only (no orderBy)', () => {
    renderHook(() => usePlcs({ asAdmin: true }));

    // The unbounded admin listen is capped so it can't stream the entire
    // collection. We deliberately omit `orderBy('name')` so the query relies
    // only on the automatic `__name__` index — the snapshot handler sorts by
    // name client-side (asserted in the parse-and-sort test below).
    expect(mockOrderBy).not.toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(500);
    expect(mockQuery).toHaveBeenCalledWith('plcs', { __limit: 500 });
  });

  it('skips the listener when signed out', () => {
    useAuthMock.mockReturnValue({ user: null });

    renderHook(() => usePlcs({ asAdmin: true }));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('parses + sorts PLCs returned by the admin snapshot', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcs({ asAdmin: true }));

    act(() => {
      cb({
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
          fn({
            id: 'plc-z',
            data: () => ({
              name: 'Zoology PLC',
              leadUid: 'lead-z',
              memberUids: ['lead-z'],
              memberEmails: { 'lead-z': 'z@x.com' },
              createdAt: 1,
              updatedAt: 2,
            }),
          });
          fn({
            id: 'plc-a',
            data: () => ({
              name: 'Algebra PLC',
              leadUid: 'lead-a',
              memberUids: ['lead-a'],
              memberEmails: { 'lead-a': 'a@x.com' },
              createdAt: 3,
              updatedAt: 4,
            }),
          });
        },
      });
    });

    // Admin sees BOTH PLCs even though they're a member of neither, sorted by
    // name (the hook's stable client-side sort).
    expect(result.current.plcs.map((p) => p.id)).toEqual(['plc-a', 'plc-z']);
    expect(result.current.loading).toBe(false);
  });

  it('sets error when the snapshot fails (no silent empty list)', () => {
    let errCb: (err: unknown) => void = () => {
      throw new Error('error callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      errCb = onError as (err: unknown) => void;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcs({ asAdmin: true }));

    act(() => {
      errCb(new Error('permission-denied'));
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('permission-denied');
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error when a later snapshot recovers', () => {
    let nextCb: (snap: unknown) => void = () => undefined;
    let errCb: (err: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext, onError) => {
      nextCb = onNext as (snap: unknown) => void;
      errCb = onError as (err: unknown) => void;
      return () => undefined;
    });

    const { result } = renderHook(() => usePlcs({ asAdmin: true }));

    act(() => {
      errCb(new Error('transient'));
    });
    expect(result.current.error).toBeInstanceOf(Error);

    act(() => {
      nextCb({ forEach: () => undefined });
    });
    expect(result.current.error).toBeNull();
  });

  it('defaults error to null before any snapshot resolves', () => {
    const { result } = renderHook(() => usePlcs({ asAdmin: true }));
    expect(result.current.error).toBeNull();
  });
});

describe('usePlcs - getPlcSharedSheetUrl state-first caching (F10)', () => {
  /**
   * Render the hook and push a snapshot containing the given PLC docs so the
   * live `plcs` state (and the mirrored ref the selectors read) is hydrated.
   * Returns the hook result handle for the caller to exercise.
   */
  function renderWithHydratedPlcs(
    docs: Array<{ id: string; data: Record<string, unknown> }>
  ) {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });

    const view = renderHook(() => usePlcs({ asAdmin: true }));

    act(() => {
      cb({
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
          docs.forEach((d) => fn({ id: d.id, data: () => d.data }));
        },
      });
    });

    return view;
  }

  it('returns the cached sharedSheetUrl from live state WITHOUT a getDoc', async () => {
    const { result } = renderWithHydratedPlcs([
      {
        id: 'plc-1',
        data: {
          name: 'Algebra PLC',
          leadUid: 'lead-1',
          memberUids: ['lead-1'],
          memberEmails: { 'lead-1': 'a@x.com' },
          sharedSheetUrl: 'https://docs.google.com/spreadsheets/d/abc',
          createdAt: 1,
          updatedAt: 2,
        },
      },
    ]);

    // The snapshot already carried a populated sharedSheetUrl, so the
    // assignment-create "already created?" check must be served from state.
    let url: string | null = null;
    await act(async () => {
      url = await result.current.getPlcSharedSheetUrl('plc-1');
    });

    expect(url).toBe('https://docs.google.com/spreadsheets/d/abc');
    // The whole point of F10: no redundant network read for data already in
    // the live subscription.
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('falls back to getDoc when the PLC is not in state (subscription not hydrated)', async () => {
    // No snapshot pushed → `plcs` state stays empty, so the selector misses.
    const { result } = renderHook(() => usePlcs({ asAdmin: true }));

    mockDoc.mockReturnValue({ __ref: 'plcs/plc-missing' });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ sharedSheetUrl: 'https://docs.google.com/strong-read' }),
    });

    let url: string | null = null;
    await act(async () => {
      url = await result.current.getPlcSharedSheetUrl('plc-missing');
    });

    // Safety guarantee: a PLC absent from state must still resolve via the
    // authoritative strong read, never regress to a missing value.
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(url).toBe('https://docs.google.com/strong-read');
  });

  it('falls back to getDoc when state reports a null/absent sharedSheetUrl (strong-read race guard)', async () => {
    const { result } = renderWithHydratedPlcs([
      {
        id: 'plc-2',
        data: {
          name: 'Biology PLC',
          leadUid: 'lead-2',
          memberUids: ['lead-2'],
          memberEmails: { 'lead-2': 'b@x.com' },
          // sharedSheetUrl absent → parsed as null in state.
          createdAt: 1,
          updatedAt: 2,
        },
      },
    ]);

    mockDoc.mockReturnValue({ __ref: 'plcs/plc-2' });
    // A racing teammate populated the URL after our last snapshot tick — the
    // strong read must surface it rather than trusting the stale "empty"
    // state value.
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ sharedSheetUrl: 'https://docs.google.com/raced' }),
    });

    let url: string | null = null;
    await act(async () => {
      url = await result.current.getPlcSharedSheetUrl('plc-2');
    });

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(url).toBe('https://docs.google.com/raced');
  });

  it('getPlcFromState returns the live PLC, or undefined when absent', () => {
    const { result } = renderWithHydratedPlcs([
      {
        id: 'plc-3',
        data: {
          name: 'Chemistry PLC',
          leadUid: 'lead-3',
          memberUids: ['lead-3'],
          memberEmails: { 'lead-3': 'c@x.com' },
          sharedSheetUrl: 'https://docs.google.com/spreadsheets/d/xyz',
          createdAt: 1,
          updatedAt: 2,
        },
      },
    ]);

    expect(result.current.getPlcFromState('plc-3')?.sharedSheetUrl).toBe(
      'https://docs.google.com/spreadsheets/d/xyz'
    );
    expect(result.current.getPlcFromState('nope')).toBeUndefined();
  });
});
