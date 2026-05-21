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
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { usePlcs } from '@/hooks/usePlcs';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: { field, op, value },
  })),
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
  });

  it('admin mode subscribes to the WHOLE /plcs collection (no membership filter)', () => {
    renderHook(() => usePlcs({ asAdmin: true }));

    // Admins must enumerate every PLC regardless of membership — so NO
    // `where('memberUids', ...)` constraint may be applied.
    expect(mockWhere).not.toHaveBeenCalled();
    // The query is the bare collection ref with no constraints.
    expect(mockQuery).toHaveBeenCalledWith('plcs');
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
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
