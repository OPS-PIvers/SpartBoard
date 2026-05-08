// Hook test for `usePlcAssignments` (Phase 3). Mirrors
// `usePlcQuizzes.test.ts` structure exactly — same mock surface, same
// snapshot-driven parser exercise, same plcId-reset coverage. The two
// hooks share a pattern, so the tests should too.
//
// Tests pin the following invariants:
//   - server-side orderBy(updatedAt, desc) wiring
//   - listener gating (null plcId, signed-out user)
//   - parser drops malformed docs (missing required fields, wrong types)
//   - parser coerces optional sharedByName/sharedByEmail to ''
//   - parser falls back on unknown sessionMode and non-number attemptLimit
//   - state resets synchronously when plcId changes (no stale-PLC flash)
//   - shareAssignmentTemplate / deleteAssignmentTemplate target the
//     canonical doc paths
//   - `writePlcAssignmentTemplate` (fire-and-forget helper used by the
//     reverse-bubble-up path in `useQuizAssignments`) swallows errors via
//     `logError` so it never blocks the canonical assignment write.

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
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import {
  usePlcAssignments,
  writePlcAssignmentTemplate,
} from '@/hooks/usePlcAssignments';
import { logError } from '@/utils/logError';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
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
const mockDeleteDoc = deleteDoc as Mock;
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
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockSetDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({ user: { uid: TEACHER_UID } });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// usePlcAssignments - subscription wiring
// ---------------------------------------------------------------------------

describe('usePlcAssignments - subscription wiring', () => {
  it('uses server-side orderBy(updatedAt, desc) so latest edits surface first', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcAssignments(PLC_ID));

    expect(mockOrderBy).toHaveBeenCalledWith('updatedAt', 'desc');
    expect(mockQuery).toHaveBeenCalledWith(`plcs/${PLC_ID}/assignments`, {
      __orderBy: { field: 'updatedAt', dir: 'desc' },
    });
  });

  it('skips the listener when plcId is null (dashboard closed)', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcAssignments(null));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('skips the listener when the user is signed out', () => {
    useAuthMock.mockReturnValue({ user: null });
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcAssignments(PLC_ID));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// usePlcAssignments - parseTemplate (via snapshot)
// ---------------------------------------------------------------------------

function fakeSnap(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
      for (const d of docs) {
        fn({ id: d.id, data: () => d.data });
      }
    },
  };
}

describe('usePlcAssignments - parseTemplate (via snapshot)', () => {
  it('drops entries missing required fields (defensive parse)', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcAssignments(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            // Valid — must survive
            id: 'a',
            data: {
              quizTitle: 'Fractions',
              quizId: 'quiz-1',
              syncGroupId: 'group-A',
              sessionMode: 'teacher',
              sessionOptions: { speedBonusEnabled: true },
              attemptLimit: 1,
              sharedBy: 'u1',
              sharedByEmail: 'a@x.com',
              sharedByName: 'Alice',
              sharedAt: 1000,
              updatedAt: 1500,
            },
          },
          {
            // Missing quizTitle — must be dropped
            id: 'b',
            data: {
              quizId: 'quiz-2',
              syncGroupId: 'group-B',
              sharedBy: 'u2',
              sharedAt: 2000,
              updatedAt: 2000,
            },
          },
          {
            // syncGroupId not a string — must be dropped (the doc would be
            // unable to participate in collaborative editing)
            id: 'c',
            data: {
              quizTitle: 'C Quiz',
              quizId: 'quiz-3',
              syncGroupId: 42,
              sharedBy: 'u1',
              sharedAt: 3000,
              updatedAt: 3000,
            },
          },
          {
            // sharedAt not a number — must be dropped (sort key invalid)
            id: 'd',
            data: {
              quizTitle: 'D Quiz',
              quizId: 'quiz-4',
              syncGroupId: 'group-D',
              sharedBy: 'u1',
              sharedAt: 'soon',
              updatedAt: 4000,
            },
          },
        ])
      );
    });

    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].id).toBe('a');
  });

  it('coerces optional sharedByName/sharedByEmail to empty strings when missing', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcAssignments(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'a',
            data: {
              quizTitle: 'A',
              quizId: 'quiz-1',
              syncGroupId: 'group-A',
              sessionMode: 'auto',
              sessionOptions: {},
              attemptLimit: null,
              sharedBy: 'u1',
              sharedAt: 1000,
              updatedAt: 1000,
              // sharedByName + sharedByEmail intentionally absent
            },
          },
        ])
      );
    });

    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0]).toMatchObject({
      sharedByEmail: '',
      sharedByName: '',
    });
    expect(result.current.loading).toBe(false);
  });

  it("falls back to 'auto' sessionMode when missing/invalid", () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcAssignments(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'bad-mode',
            data: {
              quizTitle: 'X',
              quizId: 'quiz-1',
              syncGroupId: 'group-A',
              // Garbage mode — must be coerced rather than dropping the
              // row, so a corrupt write doesn't hide it from Library.
              sessionMode: 'banana',
              sessionOptions: {},
              attemptLimit: null,
              sharedBy: 'u1',
              sharedAt: 1000,
              updatedAt: 1000,
            },
          },
        ])
      );
    });

    expect(result.current.templates[0].sessionMode).toBe('auto');
  });

  it('coerces non-number attemptLimit to null', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcAssignments(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'a',
            data: {
              quizTitle: 'A',
              quizId: 'quiz-1',
              syncGroupId: 'group-A',
              sessionMode: 'teacher',
              sessionOptions: {},
              // String — pre-Phase-3 docs that snuck through, or a
              // future schema regression. Default to null = unlimited.
              attemptLimit: 'one',
              sharedBy: 'u1',
              sharedAt: 1000,
              updatedAt: 1000,
            },
          },
        ])
      );
    });

    expect(result.current.templates[0].attemptLimit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// usePlcAssignments - state reset on plcId change
// ---------------------------------------------------------------------------

describe('usePlcAssignments - state reset on plcId change', () => {
  it('resets templates + loading synchronously when plcId changes (no stale-PLC flash)', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePlcAssignments(id),
      { initialProps: { id: 'plc-A' } }
    );

    act(() => {
      cb(
        fakeSnap([
          {
            id: 't-A',
            data: {
              quizTitle: 'PLC A Template',
              quizId: 'quiz-1',
              syncGroupId: 'group-A',
              sessionMode: 'teacher',
              sessionOptions: {},
              attemptLimit: null,
              sharedBy: 'u1',
              sharedAt: 1000,
              updatedAt: 1000,
            },
          },
        ])
      );
    });
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.loading).toBe(false);

    rerender({ id: 'plc-B' });

    expect(result.current.templates).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// usePlcAssignments - mutators
// ---------------------------------------------------------------------------

describe('usePlcAssignments - mutators', () => {
  it('shareAssignmentTemplate writes the canonical payload to plcs/{plcId}/assignments/{plcAssignmentId}', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcAssignments(PLC_ID));

    await result.current.shareAssignmentTemplate({
      plcAssignmentId: 'tmpl-1',
      quizId: 'quiz-1',
      quizTitle: 'My Quiz',
      syncGroupId: 'group-1',
      sessionMode: 'teacher',
      sessionOptions: { speedBonusEnabled: true },
      attemptLimit: 1,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@example.com',
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe(`plcs/${PLC_ID}/assignments/tmpl-1`);
    expect(payload).toMatchObject({
      id: 'tmpl-1',
      quizId: 'quiz-1',
      quizTitle: 'My Quiz',
      syncGroupId: 'group-1',
      sessionMode: 'teacher',
      attemptLimit: 1,
      sharedBy: TEACHER_UID,
      sharedByEmail: 'alice@example.com',
      sharedByName: 'Alice',
    });
    expect(payload.sharedAt).toBe(payload.updatedAt);
  });

  it('deleteAssignmentTemplate deletes the canonical doc id', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcAssignments(PLC_ID));

    await result.current.deleteAssignmentTemplate('tmpl-1');

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledWith(
      `plcs/${PLC_ID}/assignments/tmpl-1`
    );
  });
});

// ---------------------------------------------------------------------------
// writePlcAssignmentTemplate — fire-and-forget helper used from
// `useQuizAssignments.createAssignment` reverse-bubble-up
// ---------------------------------------------------------------------------

describe('writePlcAssignmentTemplate', () => {
  it('writes the canonical payload to plcs/{plcId}/assignments/{plcAssignmentId}', async () => {
    await writePlcAssignmentTemplate(PLC_ID, TEACHER_UID, {
      plcAssignmentId: 'tmpl-1',
      quizId: 'quiz-1',
      quizTitle: 'My Quiz',
      syncGroupId: 'group-1',
      sessionMode: 'teacher',
      sessionOptions: {},
      attemptLimit: null,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@example.com',
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe(`plcs/${PLC_ID}/assignments/tmpl-1`);
    expect(payload).toMatchObject({
      id: 'tmpl-1',
      quizId: 'quiz-1',
      quizTitle: 'My Quiz',
      syncGroupId: 'group-1',
      sharedBy: TEACHER_UID,
      attemptLimit: null,
    });
  });

  it('swallows errors via logError (must NOT reject — fire-and-forget contract)', async () => {
    const err = new Error('quota-exceeded');
    mockSetDoc.mockRejectedValueOnce(err);

    // The canonical assignment write in `useQuizAssignments.createAssignment`
    // already committed by the time this helper is called. Rejecting here
    // would surface as an unhandled-promise rejection because the call
    // site uses `void writePlcAssignmentTemplate(...)`. The helper must
    // log + swallow so the create flow stays fast.
    await expect(
      writePlcAssignmentTemplate(PLC_ID, TEACHER_UID, {
        plcAssignmentId: 'tmpl-1',
        quizId: 'quiz-1',
        quizTitle: 'My Quiz',
        syncGroupId: 'group-1',
        sessionMode: 'teacher',
        sessionOptions: {},
        attemptLimit: null,
        sharedByName: 'Alice',
        sharedByEmail: 'alice@example.com',
      })
    ).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledWith(
      'writePlcAssignmentTemplate.write',
      err,
      { plcId: PLC_ID, plcAssignmentId: 'tmpl-1' }
    );
  });
});
