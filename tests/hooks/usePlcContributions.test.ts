import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { collection, onSnapshot } from 'firebase/firestore';
import { usePlcContributions } from '@/hooks/usePlcContributions';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockCollection = collection as Mock;
const mockOnSnapshot = onSnapshot as Mock;

const PLC_ID = 'plc-1';

/**
 * Build a fake Firestore QuerySnapshot whose `forEach` yields the crafted
 * docs as `{ id, data: () => ({...}) }`, mirroring the pattern used by
 * usePlcDocs.test.ts. The hook only consumes `forEach` and `d.data()`.
 */
function fakeSnap(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
      for (const d of docs) fn({ id: d.id, data: () => d.data });
    },
  };
}

/**
 * Render the hook while capturing the onSnapshot success callback so tests
 * can drive parsing by invoking it with a fake snapshot.
 */
function renderWithCapturedSnapshot() {
  let onNext: (snap: unknown) => void = () => undefined;
  let onError: (err: Error) => void = () => undefined;
  mockOnSnapshot.mockImplementation((_ref, next, err) => {
    onNext = next as (snap: unknown) => void;
    onError = err as (e: Error) => void;
    return () => undefined;
  });
  const rendered = renderHook(() => usePlcContributions(PLC_ID));
  return {
    ...rendered,
    emit: (docs: Array<{ id: string; data: Record<string, unknown> }>) =>
      act(() => onNext(fakeSnap(docs))),
    emitError: (message: string) => act(() => onError(new Error(message))),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
});

describe('usePlcContributions — listener wiring', () => {
  it('subscribes to the contributions subcollection for the given plcId', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcContributions(PLC_ID));
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'plcs',
      PLC_ID,
      'contributions'
    );
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('starts in the loading state until the first snapshot arrives', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcContributions(PLC_ID));
    expect(result.current.loading).toBe(true);
    expect(result.current.contributions).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });
});

describe('usePlcContributions — happy-path parsing', () => {
  it('parses a fully valid v1 contribution doc into the typed shape', () => {
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'quiz-a_teacher-1',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'Ms. Rivera',
          updatedAt: 1718764800000,
          questionsSnapshot: [
            { id: 'q1', text: 'What is 2 + 2?', points: 1 },
            { id: 'q2', text: 'Name a primary color.', points: 2 },
          ],
          responses: [
            {
              studentDisplayName: 'Ada',
              pin: '4821',
              classPeriod: 'Period 3',
              status: 'completed',
              scorePercent: 100,
              pointsEarned: 3,
              maxPoints: 3,
              tabSwitchWarnings: 0,
              submittedAt: 1718764700000,
              pointsByQuestionId: { q1: 1, q2: 2 },
            },
          ],
        },
      },
    ]);

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.contributions).toHaveLength(1);

    const c = result.current.contributions[0];
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.id).toBe('quiz-a_teacher-1');
    expect(c.schemaVersion).toBe(1);
    expect(c.quizId).toBe('quiz-a');
    expect(c.syncGroupId).toBe('group-7');
    expect(c.teacherUid).toBe('teacher-1');
    expect(c.teacherName).toBe('Ms. Rivera');
    expect(c.updatedAt).toBe(1718764800000);

    expect(c.questionsSnapshot).toEqual([
      { id: 'q1', text: 'What is 2 + 2?', points: 1 },
      { id: 'q2', text: 'Name a primary color.', points: 2 },
    ]);

    expect(c.responses).toHaveLength(1);
    const r = c.responses[0];
    expect(r?.studentDisplayName).toBe('Ada');
    expect(r?.pin).toBe('4821');
    expect(r?.classPeriod).toBe('Period 3');
    expect(r?.status).toBe('completed');
    expect(r?.scorePercent).toBe(100);
    expect(r?.pointsEarned).toBe(3);
    expect(r?.maxPoints).toBe(3);
    expect(r?.tabSwitchWarnings).toBe(0);
    expect(r?.submittedAt).toBe(1718764700000);
    expect(r?.pointsByQuestionId).toEqual({ q1: 1, q2: 2 });
  });

  it('groups multiple teachers under the same syncGroupId', () => {
    const { result, emit } = renderWithCapturedSnapshot();

    const baseQuestions = [{ id: 'q1', text: 'Q1', points: 1 }];
    const baseResponses = [
      {
        studentDisplayName: 'Stu',
        pin: null,
        classPeriod: '',
        status: 'completed',
        scorePercent: 100,
        pointsEarned: 1,
        maxPoints: 1,
        tabSwitchWarnings: 0,
        submittedAt: 1,
        pointsByQuestionId: { q1: 1 },
      },
    ];

    emit([
      {
        id: 'quiz-a_teacher-1',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'Teacher One',
          updatedAt: 10,
          questionsSnapshot: baseQuestions,
          responses: baseResponses,
        },
      },
      {
        id: 'quiz-b_teacher-2',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-b',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-2',
          teacherName: 'Teacher Two',
          updatedAt: 20,
          questionsSnapshot: baseQuestions,
          responses: baseResponses,
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(2);
    const groupIds = new Set(
      result.current.contributions.map((c) => c.syncGroupId)
    );
    expect(groupIds).toEqual(new Set(['group-7']));
    const teacherUids = result.current.contributions
      .map((c) => c.teacherUid)
      .sort();
    expect(teacherUids).toEqual(['teacher-1', 'teacher-2']);
  });
});

describe('usePlcContributions — syncGroupId coercion', () => {
  it('preserves syncGroupId when it is a string', () => {
    const { result, emit } = renderWithCapturedSnapshot();
    emit([
      {
        id: 'c1',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-9',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);
    expect(result.current.contributions[0]?.syncGroupId).toBe('group-9');
  });

  it('coerces syncGroupId to null when the field is absent', () => {
    const { result, emit } = renderWithCapturedSnapshot();
    emit([
      {
        id: 'c1',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          // syncGroupId omitted (legacy unsynced quiz)
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);
    expect(result.current.contributions).toHaveLength(1);
    expect(result.current.contributions[0]?.syncGroupId).toBeNull();
  });
});

describe('usePlcContributions — response default-filling', () => {
  it('applies per-field defaults when optional response fields are missing', () => {
    const { result, emit } = renderWithCapturedSnapshot();
    emit([
      {
        id: 'c1',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: null,
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: [
            {
              // Only the required `status` is provided; every optional field
              // is absent so the parser must fill the documented defaults.
              status: 'in-progress',
            },
          ],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(1);
    const r = result.current.contributions[0]?.responses[0];
    expect(r?.studentDisplayName).toBe('Student');
    expect(r?.pin).toBeNull();
    expect(r?.classPeriod).toBe('');
    expect(r?.status).toBe('in-progress');
    expect(r?.scorePercent).toBeNull();
    expect(r?.pointsEarned).toBe(0);
    expect(r?.maxPoints).toBe(0);
    expect(r?.tabSwitchWarnings).toBe(0);
    expect(r?.submittedAt).toBeNull();
    expect(r?.pointsByQuestionId).toEqual({});
  });
});

describe('usePlcContributions — reject-on-malformed (per-doc isolation)', () => {
  it('drops a doc with a non-string quizId while keeping a sibling valid doc', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'bad-quizid',
        data: {
          schemaVersion: 1,
          quizId: 42, // not a string → whole doc rejected
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: [],
        },
      },
      {
        id: 'good',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-2',
          teacherName: 'T2',
          updatedAt: 2,
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(1);
    expect(result.current.contributions[0]?.id).toBe('good');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('drops a doc missing teacherUid', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'no-teacher',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          // teacherUid omitted → whole doc rejected
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('drops a doc whose updatedAt is not a number', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'bad-updatedat',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: '2026-06-19', // string, not number → rejected
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('usePlcContributions — schemaVersion forward-compat guard', () => {
  it('rejects a doc whose schemaVersion is not 1', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'v2-doc',
        data: {
          schemaVersion: 2, // future shape → must not be parsed by the v1 parser
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('usePlcContributions — array-shape guards', () => {
  it('rejects a doc whose questionsSnapshot is not an array', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'bad-questions',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: { '0': { id: 'q1', text: 'Q', points: 1 } }, // object, not array
          responses: [],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects a doc whose responses is not an array', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'bad-responses',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: 'none', // string, not array
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('usePlcContributions — whole-doc rejection on malformed question entry', () => {
  it('rejects the WHOLE doc when a single question entry is malformed (no partial parse)', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'one-bad-question',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [
            { id: 'q1', text: 'Valid question', points: 1 },
            // points is a string → malformed; the whole doc must be dropped
            // rather than keeping only the first (valid) question.
            { id: 'q2', text: 'Bad points', points: 'two' },
          ],
          responses: [],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('malformed question entry'),
      'one-bad-question'
    );
    warnSpy.mockRestore();
  });

  it('rejects the WHOLE doc when a question entry is missing its id', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'question-missing-id',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [{ text: 'No id here', points: 1 }],
          responses: [],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('usePlcContributions — whole-doc rejection on malformed response entry', () => {
  it('rejects the WHOLE doc when a response has an invalid status', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'bad-status',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: [
            // 'abandoned' is not a permitted status → whole doc dropped.
            { studentDisplayName: 'Ada', status: 'abandoned' },
          ],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('malformed response entry'),
      'bad-status'
    );
    warnSpy.mockRestore();
  });

  it('rejects the WHOLE doc when a pointsByQuestionId value is non-numeric', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { result, emit } = renderWithCapturedSnapshot();

    emit([
      {
        id: 'bad-points-map',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [{ id: 'q1', text: 'Q', points: 1 }],
          responses: [
            {
              status: 'completed',
              // q1 maps to a string → the response (and whole doc) is rejected.
              pointsByQuestionId: { q1: '1' },
            },
          ],
        },
      },
    ]);

    expect(result.current.contributions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('usePlcContributions — error path and recovery', () => {
  it('sets error to err.message and loading false on the snapshot error callback', () => {
    const { result, emitError } = renderWithCapturedSnapshot();

    expect(result.current.loading).toBe(true);
    emitError('Missing or insufficient permissions.');

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe(
      'Missing or insufficient permissions.'
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.contributions).toHaveLength(0);
  });

  it('clears error back to null when a subsequent successful snapshot arrives', () => {
    const { result, emit, emitError } = renderWithCapturedSnapshot();

    emitError('Transient network blip.');
    expect(result.current.error?.message).toBe('Transient network blip.');

    emit([
      {
        id: 'c1',
        data: {
          schemaVersion: 1,
          quizId: 'quiz-a',
          syncGroupId: 'group-7',
          teacherUid: 'teacher-1',
          teacherName: 'T',
          updatedAt: 1,
          questionsSnapshot: [],
          responses: [],
        },
      },
    ]);

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.contributions).toHaveLength(1);
  });
});

describe('usePlcContributions — idle path', () => {
  it('stays idle and does not subscribe when plcId is null', () => {
    const { result } = renderHook(() => usePlcContributions(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.contributions).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(mockCollection).not.toHaveBeenCalled();
  });
});
