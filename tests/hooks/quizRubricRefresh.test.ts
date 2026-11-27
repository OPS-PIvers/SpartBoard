import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizPublicQuestion, Rubric } from '@/types';

const store = new Map<string, Record<string, unknown>>();
const updates: Array<[string, Record<string, unknown>]> = [];

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  const doc = (base: unknown, ...segments: string[]) => ({
    path: [
      ...(typeof base === 'object' && base && 'path' in base
        ? [(base as { path: string }).path]
        : []),
      ...segments,
    ].join('/'),
  });
  return {
    ...actual,
    doc,
    runTransaction: async (
      _db: unknown,
      fn: (tx: unknown) => Promise<void>
    ) => {
      const pending: Array<[string, Record<string, unknown>]> = [];
      await fn({
        get: (ref: { path: string }) =>
          Promise.resolve({
            exists: () => store.has(ref.path),
            data: () => store.get(ref.path),
          }),
        update: (ref: { path: string }, data: Record<string, unknown>) =>
          pending.push([ref.path, data]),
      });
      updates.push(...pending);
    },
  };
});

import {
  applyRubricEditToPublicQuestions,
  refreshAssignmentRubric,
} from '@/hooks/quizRubricRefresh';

const rubric = (top: number, examples = false): Rubric => ({
  id: 'r1',
  title: 'Essay',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'c1',
      name: 'Claim',
      ...(examples ? { guide: { examples: ['secret'] } } : {}),
      levels: [
        { id: 'l1', label: 'Low', points: 1 },
        { id: 'l2', label: 'High', points: top },
      ],
    },
    {
      id: 'c2',
      name: 'Evidence',
      levels: [{ id: 'l3', label: 'Full', points: 2 }],
    },
  ],
});

const served = (): QuizPublicQuestion[] =>
  [
    {
      id: 'w1',
      type: 'free-response',
      text: 'Explain.',
      timeLimit: 0,
      points: 4,
      rubricSnapshot: rubric(2),
      rubricHidden: true,
    },
    { id: 'm1', type: 'MC', text: 'Pick', timeLimit: 0, choices: ['a', 'b'] },
  ] as unknown as QuizPublicQuestion[];

const KEY = 'users/t1/quiz_assignments/a1/key/answers';

beforeEach(() => {
  store.clear();
  updates.length = 0;
});

describe('applyRubricEditToPublicQuestions', () => {
  it('moves a served question to the new total without leaking examples', () => {
    const { questions, repointedIds } = applyRubricEditToPublicQuestions(
      served(),
      rubric(5, true)
    );
    expect(repointedIds).toEqual(['w1']);
    expect(questions[0].points).toBe(7);
    expect(JSON.stringify(questions[0].rubricSnapshot)).not.toContain('secret');
  });

  it('leaves questions without the rubric untouched', () => {
    const input = served();
    const { questions } = applyRubricEditToPublicQuestions(input, rubric(5));
    expect(questions[1]).toBe(input[1]);
  });
});

describe('refreshAssignmentRubric', () => {
  it('updates the session publicQuestions and the server key points', async () => {
    store.set('quiz_sessions/s1', {
      teacherUid: 't1',
      assignmentId: 'a1',
      publicQuestions: served(),
    });
    store.set(KEY, {
      questions: [
        { id: 'w1', type: 'free-response', points: 4, correctAnswer: '' },
        { id: 'm1', type: 'MC', points: 1, correctAnswer: 'a' },
      ],
    });
    await refreshAssignmentRubric({ sessionId: 's1', rubric: rubric(5) });
    const byPath = new Map(updates);
    const pq = byPath.get('quiz_sessions/s1')
      ?.publicQuestions as QuizPublicQuestion[];
    expect(pq[0].points).toBe(7);
    expect(byPath.get(KEY)?.questions).toEqual([
      { id: 'w1', type: 'free-response', points: 7, correctAnswer: '' },
      { id: 'm1', type: 'MC', points: 1, correctAnswer: 'a' },
    ]);
  });

  it('writes the content doc for a per-period session and skips a missing key', async () => {
    store.set('quiz_sessions/s1', {
      teacherUid: 't1',
      questionsInContent: true,
      publicQuestions: [],
    });
    store.set('quiz_sessions/s1/content/questions', {
      publicQuestions: served(),
    });
    await refreshAssignmentRubric({ sessionId: 's1', rubric: rubric(3) });
    expect(updates.map(([p]) => p)).toEqual([
      'quiz_sessions/s1/content/questions',
    ]);
    expect(
      (updates[0][1].publicQuestions as QuizPublicQuestion[])[0].points
    ).toBe(5);
  });

  it('writes nothing when no served question carries the rubric', async () => {
    store.set('quiz_sessions/s1', {
      teacherUid: 't1',
      publicQuestions: [served()[1]],
    });
    await refreshAssignmentRubric({ sessionId: 's1', rubric: rubric(5) });
    expect(updates).toEqual([]);
  });
});
