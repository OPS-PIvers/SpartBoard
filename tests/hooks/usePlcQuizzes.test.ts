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
  updateDoc,
} from 'firebase/firestore';
import { usePlcQuizzes, writePlcQuizEntry } from '@/hooks/usePlcQuizzes';
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
  updateDoc: vi.fn(),
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
const mockUpdateDoc = updateDoc as Mock;
const mockLogError = logError as unknown as Mock;

const TEACHER_UID = 'teacher-1';
const PLC_ID = 'plc-1';

beforeEach(() => {
  vi.clearAllMocks();
  // Resolve doc/collection refs to addressable strings so assertions can
  // verify which path the listener attached to.
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({ user: { uid: TEACHER_UID } });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// usePlcQuizzes - subscription wiring
// ---------------------------------------------------------------------------

describe('usePlcQuizzes - subscription wiring', () => {
  it('uses server-side orderBy(updatedAt, desc) so latest edits surface first', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcQuizzes(PLC_ID));

    expect(mockOrderBy).toHaveBeenCalledWith('updatedAt', 'desc');
    expect(mockQuery).toHaveBeenCalledWith(`plcs/${PLC_ID}/quizzes`, {
      __orderBy: { field: 'updatedAt', dir: 'desc' },
    });
  });

  it('skips the listener when plcId is null (dashboard closed)', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcQuizzes(null));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('skips the listener when the user is signed out', () => {
    useAuthMock.mockReturnValue({ user: null });
    mockOnSnapshot.mockReturnValue(() => undefined);

    renderHook(() => usePlcQuizzes(PLC_ID));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// usePlcQuizzes - parser (via snapshot)
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

describe('usePlcQuizzes - parseEntry (via snapshot)', () => {
  it('drops entries missing required fields (defensive parse)', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            // Valid — must survive
            id: 'a',
            data: {
              title: 'A Quiz',
              questionCount: 5,
              syncGroupId: 'group-A',
              sharedBy: 'u1',
              sharedByEmail: 'a@x.com',
              sharedByName: 'Alice',
              sharedAt: 1000,
              updatedAt: 1500,
            },
          },
          {
            // Missing title — must be dropped
            id: 'b',
            data: {
              questionCount: 3,
              syncGroupId: 'group-B',
              sharedBy: 'u2',
              sharedAt: 2000,
              updatedAt: 2000,
            },
          },
          {
            // questionCount not a number — must be dropped
            id: 'c',
            data: {
              title: 'C Quiz',
              questionCount: 'three',
              syncGroupId: 'group-C',
              sharedBy: 'u1',
              sharedAt: 3000,
              updatedAt: 3000,
            },
          },
          {
            // syncGroupId not a string — must be dropped (the doc would be
            // unable to participate in collaborative editing)
            id: 'd',
            data: {
              title: 'D Quiz',
              questionCount: 4,
              syncGroupId: 42,
              sharedBy: 'u1',
              sharedAt: 4000,
              updatedAt: 4000,
            },
          },
        ])
      );
    });

    expect(result.current.quizzes).toHaveLength(1);
    expect(result.current.quizzes[0].id).toBe('a');
  });

  it('coerces optional sharedByName/sharedByEmail to empty strings when missing', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'a',
            data: {
              title: 'A',
              questionCount: 0,
              syncGroupId: 'group-A',
              sharedBy: 'u1',
              sharedAt: 1000,
              updatedAt: 1000,
              // sharedByName + sharedByEmail intentionally absent
            },
          },
        ])
      );
    });

    expect(result.current.quizzes).toHaveLength(1);
    expect(result.current.quizzes[0]).toEqual({
      id: 'a',
      title: 'A',
      questionCount: 0,
      syncGroupId: 'group-A',
      sharedBy: 'u1',
      sharedByEmail: '',
      sharedByName: '',
      sharedAt: 1000,
      updatedAt: 1000,
    });
    expect(result.current.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// usePlcQuizzes - run-settings write path (runSettingsFields)
// ---------------------------------------------------------------------------
// Writing `undefined` to Firestore throws, so the optional run-settings fields
// must be OMITTED when absent. `attemptLimit: null` (= unlimited) is meaningful
// and must survive. Exercised through shareQuizWithPlc / writePlcQuizEntry,
// which both spread runSettingsFields() into the doc.

describe('usePlcQuizzes - run-settings write path', () => {
  it('omits undefined run-settings fields from the shared Firestore doc', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    // No sessionMode/sessionOptions/attemptLimit/quizId supplied — all undefined.
    await result.current.shareQuizWithPlc({
      plcQuizId: 'pq-1',
      syncGroupId: 'group-1',
      title: 'My Quiz',
      questionCount: 7,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@example.com',
    });

    const [, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // The doc must carry no run-settings keys at all (not even as `undefined`).
    expect(payload).not.toHaveProperty('sessionMode');
    expect(payload).not.toHaveProperty('sessionOptions');
    expect(payload).not.toHaveProperty('attemptLimit');
    expect(payload).not.toHaveProperty('quizId');
    // Belt-and-suspenders: no key anywhere holds `undefined`.
    expect(Object.values(payload)).not.toContain(undefined);
  });

  it('writes attemptLimit:null (unlimited) but omits the other undefined fields', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    await result.current.shareQuizWithPlc({
      plcQuizId: 'pq-1',
      syncGroupId: 'group-1',
      title: 'My Quiz',
      questionCount: 7,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@example.com',
      attemptLimit: null,
    });

    const [, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    // null is a real value (unlimited) — must be present and preserved as null.
    expect(payload).toHaveProperty('attemptLimit', null);
    expect(payload).not.toHaveProperty('sessionMode');
    expect(payload).not.toHaveProperty('sessionOptions');
    expect(payload).not.toHaveProperty('quizId');
    expect(Object.values(payload)).not.toContain(undefined);
  });

  it('writes the supplied run-settings fields verbatim when all are present', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    const sessionOptions = { showResultToStudent: true };
    await result.current.shareQuizWithPlc({
      plcQuizId: 'pq-1',
      syncGroupId: 'group-1',
      title: 'My Quiz',
      questionCount: 7,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@example.com',
      sessionMode: 'auto',
      sessionOptions,
      attemptLimit: 3,
      quizId: 'src-quiz-1',
    });

    const [, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).toMatchObject({
      sessionMode: 'auto',
      sessionOptions,
      attemptLimit: 3,
      quizId: 'src-quiz-1',
    });
  });

  it('writePlcQuizEntry applies the same omit-undefined / keep-null rule', async () => {
    await writePlcQuizEntry(PLC_ID, TEACHER_UID, {
      plcQuizId: 'pq-1',
      syncGroupId: 'group-1',
      title: 'My Quiz',
      questionCount: 7,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@example.com',
      attemptLimit: null,
      // sessionMode/sessionOptions/quizId omitted (undefined)
    });

    const [, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload).toHaveProperty('attemptLimit', null);
    expect(payload).not.toHaveProperty('sessionMode');
    expect(payload).not.toHaveProperty('sessionOptions');
    expect(payload).not.toHaveProperty('quizId');
    expect(Object.values(payload)).not.toContain(undefined);
  });
});

// ---------------------------------------------------------------------------
// usePlcQuizzes - parseEntry run-settings (via snapshot)
// ---------------------------------------------------------------------------

describe('usePlcQuizzes - parseEntry run-settings (via snapshot)', () => {
  function renderWithSnapshot(
    docs: Array<{ id: string; data: Record<string, unknown> }>
  ) {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));
    act(() => {
      cb(fakeSnap(docs));
    });
    return result;
  }

  const baseEntry = {
    title: 'A Quiz',
    questionCount: 5,
    syncGroupId: 'group-A',
    sharedBy: 'u1',
    sharedAt: 1000,
    updatedAt: 1500,
  };

  it('parses a legacy doc (no run-settings) without attaching the optional fields', () => {
    const result = renderWithSnapshot([{ id: 'a', data: { ...baseEntry } }]);

    expect(result.current.quizzes).toHaveLength(1);
    const entry = result.current.quizzes[0];
    expect(entry).not.toHaveProperty('sessionMode');
    expect(entry).not.toHaveProperty('sessionOptions');
    expect(entry).not.toHaveProperty('attemptLimit');
    expect(entry).not.toHaveProperty('quizId');
  });

  it('attaches valid run-settings fields when present', () => {
    const result = renderWithSnapshot([
      {
        id: 'a',
        data: {
          ...baseEntry,
          sessionMode: 'student',
          sessionOptions: { showCorrectOnBoard: true },
          attemptLimit: 2,
          quizId: 'src-quiz-1',
        },
      },
    ]);

    const entry = result.current.quizzes[0];
    expect(entry.sessionMode).toBe('student');
    expect(entry.sessionOptions).toEqual({ showCorrectOnBoard: true });
    expect(entry.attemptLimit).toBe(2);
    expect(entry.quizId).toBe('src-quiz-1');
  });

  it('drops an unrecognized sessionMode while keeping the rest of the entry', () => {
    const result = renderWithSnapshot([
      { id: 'a', data: { ...baseEntry, sessionMode: 'bogus-mode' } },
    ]);

    expect(result.current.quizzes).toHaveLength(1);
    expect(result.current.quizzes[0]).not.toHaveProperty('sessionMode');
  });

  it('does NOT attach sessionOptions with no recognized boolean key (garbage object)', () => {
    const result = renderWithSnapshot([
      // Empty object — carries no real run-setting.
      { id: 'a', data: { ...baseEntry, sessionOptions: {} } },
      // Non-object garbage.
      { id: 'b', data: { ...baseEntry, sessionOptions: 'nope' } },
      // Object with only unknown keys.
      { id: 'c', data: { ...baseEntry, sessionOptions: { foo: true } } },
    ]);

    expect(result.current.quizzes).toHaveLength(3);
    for (const entry of result.current.quizzes) {
      expect(entry).not.toHaveProperty('sessionOptions');
    }
  });

  it('preserves attemptLimit:null (unlimited) from the snapshot', () => {
    const result = renderWithSnapshot([
      { id: 'a', data: { ...baseEntry, attemptLimit: null } },
    ]);

    const entry = result.current.quizzes[0];
    expect(entry).toHaveProperty('attemptLimit', null);
  });
});

// ---------------------------------------------------------------------------
// usePlcQuizzes - state reset on plcId change
// ---------------------------------------------------------------------------

describe('usePlcQuizzes - state reset on plcId change', () => {
  it('resets quizzes + loading synchronously when plcId changes (no stale-PLC flash)', () => {
    let cb: (snap: unknown) => void = () => {
      throw new Error('snapshot callback not captured');
    };
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePlcQuizzes(id),
      { initialProps: { id: 'plc-A' } }
    );

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'q-A',
            data: {
              title: 'PLC A Quiz',
              questionCount: 1,
              syncGroupId: 'group-A',
              sharedBy: 'u1',
              sharedAt: 1000,
              updatedAt: 1000,
            },
          },
        ])
      );
    });
    expect(result.current.quizzes).toHaveLength(1);
    expect(result.current.loading).toBe(false);

    rerender({ id: 'plc-B' });

    expect(result.current.quizzes).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// usePlcQuizzes - mutators
// ---------------------------------------------------------------------------

describe('usePlcQuizzes - mutators', () => {
  it('shareQuizWithPlc writes the canonical payload to plcs/{plcId}/quizzes/{plcQuizId}', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    await result.current.shareQuizWithPlc({
      plcQuizId: 'pq-1',
      syncGroupId: 'group-1',
      title: 'My Quiz',
      questionCount: 7,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@example.com',
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe(`plcs/${PLC_ID}/quizzes/pq-1`);
    expect(payload).toMatchObject({
      id: 'pq-1',
      title: 'My Quiz',
      questionCount: 7,
      syncGroupId: 'group-1',
      sharedBy: TEACHER_UID,
      sharedByEmail: 'alice@example.com',
      sharedByName: 'Alice',
    });
    expect(payload.sharedAt).toBe(payload.updatedAt);
  });

  it('mirrorPlcQuizHeader patches title/questionCount/updatedAt only', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    await result.current.mirrorPlcQuizHeader('pq-1', {
      title: 'Updated',
      questionCount: 9,
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, fields] = mockUpdateDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe(`plcs/${PLC_ID}/quizzes/pq-1`);
    expect(fields.title).toBe('Updated');
    expect(fields.questionCount).toBe(9);
    expect(typeof fields.updatedAt).toBe('number');
    // Identity / attribution fields must NOT appear in the patch — the
    // rules pin them immutable, and the parser is the only thing that
    // ever surfaces them locally.
    expect(fields).not.toHaveProperty('id');
    expect(fields).not.toHaveProperty('syncGroupId');
    expect(fields).not.toHaveProperty('sharedBy');
  });

  it('mirrorPlcQuizHeader swallows errors via logError (caller never rejects)', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const err = new Error('permission-denied');
    mockUpdateDoc.mockRejectedValueOnce(err);

    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    await expect(
      result.current.mirrorPlcQuizHeader('pq-1', { title: 'X' })
    ).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledWith(
      'usePlcQuizzes.mirrorHeader',
      err,
      { plcId: PLC_ID, plcQuizId: 'pq-1' }
    );
  });

  it('unshareQuizFromPlc deletes the canonical doc id', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcQuizzes(PLC_ID));

    await result.current.unshareQuizFromPlc('pq-1');

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledWith(`plcs/${PLC_ID}/quizzes/pq-1`);
  });
});

// ---------------------------------------------------------------------------
// writePlcQuizEntry — top-level helper (used by Widget.tsx for one-shot writes)
// ---------------------------------------------------------------------------

describe('writePlcQuizEntry', () => {
  it('writes the canonical payload to plcs/{plcId}/quizzes/{plcQuizId}', async () => {
    await writePlcQuizEntry(PLC_ID, TEACHER_UID, {
      plcQuizId: 'pq-1',
      syncGroupId: 'group-1',
      title: 'My Quiz',
      questionCount: 7,
      sharedByName: 'Alice',
      sharedByEmail: 'alice@example.com',
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe(`plcs/${PLC_ID}/quizzes/pq-1`);
    expect(payload).toMatchObject({
      id: 'pq-1',
      title: 'My Quiz',
      questionCount: 7,
      syncGroupId: 'group-1',
      sharedBy: TEACHER_UID,
      sharedByEmail: 'alice@example.com',
      sharedByName: 'Alice',
    });
  });

  it('rejects on failure (unlike Phase 1 fire-and-forget index writer)', async () => {
    const err = new Error('quota-exceeded');
    mockSetDoc.mockRejectedValueOnce(err);

    await expect(
      writePlcQuizEntry(PLC_ID, TEACHER_UID, {
        plcQuizId: 'pq-1',
        syncGroupId: 'group-1',
        title: 'My Quiz',
        questionCount: 7,
        sharedByName: 'Alice',
        sharedByEmail: 'alice@example.com',
      })
    ).rejects.toBe(err);
  });
});
