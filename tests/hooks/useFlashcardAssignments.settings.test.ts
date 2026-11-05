import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { doc, getDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { useFlashcardAssignments } from '@/hooks/useFlashcardAssignments';
import type { FlashcardCheckRules } from '@/types';

const DELETE = { __delete: true };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => DELETE),
  doc: vi.fn(),
  FieldPath: class {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  },
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

const batchUpdate = vi.fn();
const batchCommit = vi.fn();

const RULES: FlashcardCheckRules = {
  attemptLimit: 2,
  sessionOptions: { shuffleQuestions: true, showScoreOnSubmit: true },
};

const session = (extra: Record<string, unknown> = {}) =>
  vi.mocked(getDoc).mockResolvedValueOnce({
    data: () => ({ classIds: ['CL-1'], ...extra }),
  } as unknown as Awaited<ReturnType<typeof getDoc>>);

const save = async (
  patch: Parameters<
    ReturnType<typeof useFlashcardAssignments>['updateAssignmentSettings']
  >[1]
) => {
  const { result } = renderHook(() => useFlashcardAssignments('teacher-1'));
  await act(async () => {
    await result.current.updateAssignmentSettings('a-1', patch);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (onSnapshot as Mock).mockReturnValue(() => undefined);
  batchCommit.mockResolvedValue(undefined);
  (writeBatch as Mock).mockReturnValue({
    update: batchUpdate,
    commit: batchCommit,
  });
});

describe('useFlashcardAssignments updateAssignmentSettings', () => {
  it('writes rules, score visibility and the window to both docs', async () => {
    session({ lockedSettings: { shuffle: false } });
    await save({ rules: RULES, scoreVisibility: 'score', closeAt: 5 });
    expect(batchUpdate).toHaveBeenCalledTimes(2);
    const [assignmentRef, assignmentPatch] = batchUpdate.mock.calls[0];
    expect(assignmentRef).toBe('users/teacher-1/flashcard_assignments/a-1');
    expect(assignmentPatch).toMatchObject({
      rules: RULES,
      scoreVisibility: 'score',
      closeAt: 5,
    });
    const [sessionRef, sessionPatch] = batchUpdate.mock.calls[1];
    expect(sessionRef).toBe('flashcard_sessions/a-1');
    expect(sessionPatch).toEqual({
      rules: RULES,
      scoreVisibility: 'score',
      closeAt: 5,
      'lockedSettings.shuffle': true,
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('writes nothing for an empty patch', async () => {
    session();
    await save({});
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it('retargets classes on both docs and skips edits to a removed row', async () => {
    session({ periodAccess: { p1: {}, p2: {} } });
    await save({
      classEdit: {
        rosterIds: ['r1'],
        classIds: ['CL-1'],
        periodNames: ['Period 1'],
        classPeriodByClassId: {},
        periodAccessRows: { p2: null },
      },
      periodAccessEdits: { p1: { closeAt: 9 }, p2: { closeAt: 9 } },
    });
    // Class edit (assignment, session), then the row edits (assignment, session).
    expect(batchUpdate).toHaveBeenCalledTimes(4);
    const rowWrite = batchUpdate.mock.calls[2] as unknown[];
    const paths = rowWrite
      .slice(1)
      .filter(
        (v): v is { segments: string[] } =>
          typeof v === 'object' && v !== null && 'segments' in v
      )
      .map((p) => p.segments.join('.'));
    expect(paths).toEqual(['periodAccess.p1.closeAt']);
  });
});
