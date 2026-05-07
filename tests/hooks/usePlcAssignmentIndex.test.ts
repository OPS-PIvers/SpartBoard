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
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import {
  usePlcAssignmentIndex,
  writePlcAssignmentIndexEntry,
} from '@/hooks/usePlcAssignmentIndex';
import { logError } from '@/utils/logError';
import type { PlcAssignmentIndexEntry } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  setDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const useAuthMock = vi.fn<() => { user: { uid: string } | null }>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockOrderBy = orderBy as Mock;
const mockQuery = query as Mock;
const mockSetDoc = setDoc as Mock;
const mockLogError = logError as unknown as Mock;

const TEACHER_UID = 'teacher-1';
const PLC_ID = 'plc-1';

beforeEach(() => {
  vi.clearAllMocks();
  // Resolve doc/collection refs to addressable strings so assertions can
  // verify which path the listener attached to. Pattern lifted from
  // useQuizAssignments.test.ts.
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockSetDoc.mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({ user: { uid: TEACHER_UID } });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// usePlcAssignmentIndex hook
// ---------------------------------------------------------------------------

describe('usePlcAssignmentIndex - subscription wiring', () => {
  it('uses server-side orderBy(createdAt, desc) — no client-side sort needed', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcAssignmentIndex(PLC_ID));

    // The orderBy clause must be passed into `query()` so Firestore returns
    // newest-first. Without this the dashboard would render in arbitrary
    // doc order.
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mockQuery).toHaveBeenCalledWith(`plcs/${PLC_ID}/assignment_index`, {
      __orderBy: { field: 'createdAt', dir: 'desc' },
    });
  });

  it('skips the listener when plcId is null', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcAssignmentIndex(null));

    // No subscription should mount when there's no PLC selected — the
    // dashboard passes null while it's closed, and we shouldn't pay for
    // the Firestore connection then.
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('skips the listener when the user is signed out', () => {
    useAuthMock.mockReturnValue({ user: null });
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcAssignmentIndex(PLC_ID));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

describe('usePlcAssignmentIndex - parseEntry (via snapshot)', () => {
  // The parser itself isn't exported — exercise it through the snapshot
  // callback so we test the public surface and pin the contract that
  // listeners observe.
  function fakeSnap(
    docs: Array<{ id: string; data: Record<string, unknown> }>
  ) {
    return {
      forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
        for (const d of docs) {
          fn({ id: d.id, data: () => d.data });
        }
      },
    };
  }

  it('drops entries missing required fields (defensive parse)', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcAssignmentIndex(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            // Valid — must survive
            id: 'a',
            data: {
              ownerUid: 'u1',
              ownerName: 'Alice',
              ownerEmail: 'a@x.com',
              title: 'A Quiz',
              sheetUrl: 'https://example.com/a',
              createdAt: 1000,
            },
          },
          {
            // Missing title — must be dropped
            id: 'b',
            data: {
              ownerUid: 'u2',
              sheetUrl: 'https://example.com/b',
              createdAt: 2000,
            },
          },
          {
            // ownerUid not a string — must be dropped
            id: 'c',
            data: {
              ownerUid: 42,
              title: 'C Quiz',
              sheetUrl: 'https://example.com/c',
              createdAt: 3000,
            },
          },
          {
            // createdAt not a number — must be dropped
            id: 'd',
            data: {
              ownerUid: 'u4',
              title: 'D Quiz',
              sheetUrl: 'https://example.com/d',
              createdAt: 'not-a-number',
            },
          },
        ])
      );
    });

    // Only the valid entry survives. Dropping malformed rows on read keeps
    // the dashboard stable against partial-write or schema-drift bugs that
    // the firestore.rules schema lock-down should normally prevent.
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].id).toBe('a');
  });

  it('coerces optional ownerName/ownerEmail to empty string when missing', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcAssignmentIndex(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'a',
            data: {
              ownerUid: 'u1',
              title: 'A',
              sheetUrl: 'https://example.com/a',
              createdAt: 1000,
              // ownerName + ownerEmail intentionally absent
            },
          },
        ])
      );
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toEqual({
      id: 'a',
      kind: 'quiz',
      ownerUid: 'u1',
      ownerName: '',
      ownerEmail: '',
      title: 'A',
      sheetUrl: 'https://example.com/a',
      createdAt: 1000,
    });
    expect(result.current.loading).toBe(false);
  });

  it("normalizes `kind` to 'quiz' even for legacy or wrong values", () => {
    // Today the parser hardcodes `kind: 'quiz'`; this test pins that
    // behaviour so a future widening of the union has to update both the
    // parser AND this test consciously.
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcAssignmentIndex(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'a',
            data: {
              kind: 'video-activity', // future widening, ignored today
              ownerUid: 'u1',
              title: 'A',
              sheetUrl: 'https://example.com/a',
              createdAt: 1000,
            },
          },
        ])
      );
    });

    expect(result.current.entries[0].kind).toBe('quiz');
  });
});

describe('usePlcAssignmentIndex - state reset on plcId change', () => {
  it('resets entries + loading synchronously when plcId changes (no stale-PLC flash)', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePlcAssignmentIndex(id),
      { initialProps: { id: 'plc-A' } }
    );

    // Seed entries for PLC A.
    act(() => {
      cb({
        forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
          fn({
            id: 'asn-A',
            data: () => ({
              ownerUid: 'u1',
              title: 'PLC A Quiz',
              sheetUrl: 'https://example.com/A',
              createdAt: 1000,
            }),
          });
        },
      });
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.loading).toBe(false);

    // Switch PLCs — the dashboard would do this when the user picks a
    // different PLC without unmounting the hook. Without the reset, the
    // UI would briefly show PLC A's entries with `loading=false` while
    // PLC B's snapshot is in flight.
    rerender({ id: 'plc-B' });

    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});

describe('usePlcAssignmentIndex - error path', () => {
  it('routes snapshot errors through logError with the plcId scope', () => {
    let errorCb: (err: unknown) => void = () => {
      throw new Error('error callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      errorCb = onError;
      return () => undefined;
    });
    renderHook(() => usePlcAssignmentIndex(PLC_ID));

    const err = new Error('permission-denied');
    act(() => {
      errorCb(err);
    });

    // Tests that the error path (a) uses the structured logger (not
    // console.error) and (b) carries the plcId so triage can scope to
    // the affected community.
    expect(mockLogError).toHaveBeenCalledWith(
      'usePlcAssignmentIndex.snapshot',
      err,
      { plcId: PLC_ID }
    );
  });
});

// ---------------------------------------------------------------------------
// writePlcAssignmentIndexEntry
// ---------------------------------------------------------------------------

describe('writePlcAssignmentIndexEntry', () => {
  const ENTRY: PlcAssignmentIndexEntry = {
    id: 'asn-1',
    kind: 'quiz',
    ownerUid: TEACHER_UID,
    ownerName: 'Alice',
    ownerEmail: 'alice@example.com',
    title: 'My Quiz',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/abc',
    createdAt: 12345,
  };

  it('writes the entry to plcs/{plcId}/assignment_index/{entry.id} with the canonical payload', async () => {
    await writePlcAssignmentIndexEntry(PLC_ID, ENTRY);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).toHaveBeenCalledWith(
      `plcs/${PLC_ID}/assignment_index/${ENTRY.id}`,
      ENTRY
    );
  });

  it('swallows errors via logError (assignment-create stays fast even if the index write fails)', async () => {
    const err = new Error('quota-exceeded');
    mockSetDoc.mockRejectedValueOnce(err);

    // Must NOT reject — the canonical fire-and-forget contract from
    // useQuizAssignments.createAssignment relies on this. If this
    // assertion ever fails, the assign action would block on the index
    // write and slow down the user's "Assign" tap.
    await expect(
      writePlcAssignmentIndexEntry(PLC_ID, ENTRY)
    ).resolves.toBeUndefined();
    expect(mockLogError).toHaveBeenCalledWith(
      'writePlcAssignmentIndexEntry.write',
      err,
      { plcId: PLC_ID, entryId: ENTRY.id }
    );
  });
});
