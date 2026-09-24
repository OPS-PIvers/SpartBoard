// The student's first write creates the response doc; later writes touch only the fields
// the student update rule lets change (answers, pin, completedAt).
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { onSnapshot, setDoc } from 'firebase/firestore';
import { useGuidedLearningSessionStudent } from '@/hooks/useGuidedLearningSession';
import type { GuidedLearningResponse } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

const response = (
  over: Partial<GuidedLearningResponse> = {}
): GuidedLearningResponse => ({
  sessionId: 'sess-1',
  studentAnonymousId: 'stu-1',
  pin: '42',
  answers: [{ stepId: 'q1', answer: 'a', isCorrect: null }],
  startedAt: 100,
  completedAt: null,
  score: null,
  classPeriod: 'P1',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (onSnapshot as Mock).mockReturnValue(() => undefined);
  (setDoc as Mock).mockResolvedValue(undefined);
});

describe('useGuidedLearningSessionStudent.submitResponse', () => {
  it('creates the whole doc with score null on the first write', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('sess-1', 'stu-1')
    );
    await result.current.submitResponse(response());
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'guided_learning_sessions/sess-1/responses/stu-1' },
      expect.objectContaining({
        score: null,
        completedAt: null,
        startedAt: 100,
      })
    );
    expect((setDoc as Mock).mock.calls[0]).toHaveLength(2);
  });

  it('merges only answers and pin while the student is still working', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('sess-1', 'stu-1')
    );
    await result.current.submitResponse(response(), { exists: true });
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'guided_learning_sessions/sess-1/responses/stu-1' },
      { answers: response().answers, pin: '42' },
      { merge: true }
    );
  });

  it('adds completedAt on submit and never rewrites score, startedAt or the period', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('sess-1', 'stu-1')
    );
    await result.current.submitResponse(
      response({ completedAt: 500, pin: undefined }),
      { exists: true }
    );
    const written = (setDoc as Mock).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(Object.keys(written).sort()).toEqual(['answers', 'completedAt']);
    expect(written.completedAt).toBe(500);
  });
});
