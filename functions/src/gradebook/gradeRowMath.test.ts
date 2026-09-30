import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn() },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  assembleRow,
  effectiveDueAt,
  keyQuestions,
  mergeAttempts,
  parseSessionMeta,
  scoreFlashcardProgress,
  scoreGuidedLearningResponse,
  scoreProjectMember,
  scoreQuestions,
  scoreQuizResponse,
  scoreVideoResponse,
  toMillis,
  type QuizContext,
} from './gradeRowMath';
import type { RowScore } from './types';

const target = {
  id: 't1',
  kind: 'standard',
  label: 'Fractions',
  code: '5.NF.1',
};
const key = [
  {
    id: 'q1',
    type: 'MC',
    text: 'a',
    correctAnswer: 'A',
    incorrectAnswers: ['B'],
    points: 2,
    targets: [target],
  },
  { id: 'q2', type: 'FIB', text: 'b', correctAnswer: 'seven', points: 1 },
  { id: 'q3', type: 'free-response', text: 'c', points: 3 },
];

const quizCtx = (questions = keyQuestions(key)): QuizContext => ({
  questions,
  fibAnswersByStudent: () => ({}),
  overrideQuestionIds: () => [],
});

const answers = [
  { questionId: 'q1', answer: 'A' },
  { questionId: 'q2', answer: 'seven' },
  { questionId: 'q3', answer: 'because' },
];

describe('keyQuestions', () => {
  it('fills teacher-private tags from the assignment snapshot', () => {
    const qs = keyQuestions(
      [{ id: 'q1', type: 'MC', text: 'a', correctAnswer: 'A' }],
      [{ id: 'q1', targets: [target] }]
    );
    expect(qs[0].targets.map((t) => t.id)).toEqual(['t1']);
  });

  it('falls back to public questions when there is no key', () => {
    const qs = keyQuestions(
      undefined,
      [],
      [{ id: 'p1', type: 'MC', text: 'x', choices: ['A'] }]
    );
    expect(qs.map((q) => q.id)).toEqual(['p1']);
    expect(qs[0].correctAnswer).toBeNull();
  });
});

describe('scoreQuizResponse', () => {
  it('waits for the teacher while a written answer is ungraded', () => {
    const r = scoreQuizResponse(
      {},
      {
        status: 'completed',
        studentUid: 's1',
        answers,
        completedAttempts: 1,
        submittedAt: 5,
      },
      quizCtx()
    );
    expect(r).toMatchObject({
      state: 'awaiting-grade',
      rawPct: null,
      submittedAt: 5,
      attemptNumber: 1,
    });
  });

  it('computes live with manual grades and records target evidence', () => {
    const r = scoreQuizResponse(
      {},
      {
        status: 'completed',
        studentUid: 's1',
        answers: [{ questionId: 'q1', answer: 'B' }, answers[1], answers[2]],
        grading: { q3: { pointsAwarded: 3 } },
        completedAttempts: 2,
      },
      quizCtx()
    );
    expect(r).toMatchObject({
      state: 'scored',
      rawPct: 67,
      points: 4,
      max: 6,
      attemptNumber: 2,
    });
    expect(r.targetEvidence).toEqual([
      {
        targetId: 't1',
        kind: 'standard',
        label: 'Fractions',
        code: '5.NF.1',
        earned: 0,
        possible: 2,
      },
    ]);
  });

  it('trusts a stored score from publish or score-on-submit', () => {
    const r = scoreQuizResponse(
      {},
      { status: 'completed', studentUid: 's1', answers, score: 50 },
      quizCtx()
    );
    expect(r).toMatchObject({ state: 'scored', rawPct: 50, points: 3, max: 6 });
  });

  it('marks an in-progress retake as the next attempt', () => {
    const r = scoreQuizResponse(
      {},
      {
        status: 'in-progress',
        studentUid: 's1',
        answers: [],
        completedAttempts: 1,
      },
      quizCtx()
    );
    expect(r).toMatchObject({
      state: 'in-progress',
      rawPct: null,
      attemptNumber: 2,
    });
  });

  it('follows per-student publish over the session', () => {
    const published = { scorePublishedAt: 10 };
    const base = { status: 'completed', studentUid: 's1', answers, score: 50 };
    expect(scoreQuizResponse(published, base, quizCtx()).published).toBe(true);
    expect(
      scoreQuizResponse(
        published,
        { ...base, resultsOverride: { mode: 'hidden' } },
        quizCtx()
      ).published
    ).toBe(false);
    expect(
      scoreQuizResponse(
        {},
        { ...base, resultsOverride: { mode: 'shown' } },
        quizCtx()
      ).published
    ).toBe(true);
  });

  it('scores only the served subset', () => {
    const r = scoreQuizResponse(
      {},
      {
        status: 'completed',
        studentUid: 's1',
        answers: answers.slice(0, 2),
        servedQuestionIds: ['q1', 'q2'],
      },
      quizCtx()
    );
    expect(r).toMatchObject({ state: 'scored', rawPct: 100, max: 3 });
  });
});

describe('scoreQuestions', () => {
  it('counts an unanswered served question against the max', () => {
    const q = scoreQuestions({
      questions: keyQuestions(key.slice(0, 2)),
      answers: [{ questionId: 'q1', answer: 'A' }],
    });
    expect(q).toMatchObject({ earned: 2, max: 3, awaiting: false });
  });
});

describe('scoreVideoResponse', () => {
  it('uses stored correctness when the key is gone', () => {
    const questions = keyQuestions(
      undefined,
      [],
      [
        { id: 'v1', type: 'MC', text: 'x' },
        { id: 'v2', type: 'MC', text: 'y' },
      ]
    );
    const r = scoreVideoResponse(
      {},
      {
        completedAt: 9,
        answers: [
          { questionId: 'v1', answer: 'a', isCorrect: true },
          { questionId: 'v2', answer: 'b', isCorrect: false },
        ],
      },
      questions
    );
    expect(r).toMatchObject({
      state: 'scored',
      rawPct: 50,
      points: 1,
      max: 2,
      submittedAt: 9,
    });
  });
});

describe('video publish state', () => {
  it('stays unpublished after Unpublish leaves the score behind', () => {
    const r = scoreVideoResponse(
      { scoreVisibility: 'score' },
      { completedAt: 1, score: 80, answers: [] },
      []
    );
    expect(r.published).toBe(false);
  });

  it('scores only the questions a live session asked', () => {
    const questions = keyQuestions([
      { id: 'v1', type: 'MC', text: 'x', correctAnswer: 'A' },
      { id: 'v2', type: 'MC', text: 'y', correctAnswer: 'A' },
    ]);
    const r = scoreVideoResponse(
      { live: { askedQuestionIds: ['v1'] } },
      { completedAt: 1, answers: [{ questionId: 'v1', answer: 'A' }] },
      questions
    );
    expect(r).toMatchObject({ rawPct: 100, max: 1 });
  });
});

describe('scoreGuidedLearningResponse', () => {
  it('scores correct gradable steps over every gradable step', () => {
    const session = {
      publicSteps: [
        { id: 'a', question: {} },
        { id: 'b', question: {} },
        { id: 'c' },
      ],
    };
    const r = scoreGuidedLearningResponse(session, {
      completedAt: 3,
      answers: [
        { stepId: 'a', isCorrect: true },
        { stepId: 'c', isCorrect: true },
      ],
    });
    expect(r).toMatchObject({ state: 'scored', rawPct: 50, points: 1, max: 2 });
  });
});

describe('scoreFlashcardProgress', () => {
  it('turns a correct count into a percent', () => {
    const r = scoreFlashcardProgress(
      { scorePublishedAt: 1 },
      { submittedAt: 4, score: 9, total: 12, classId: 'c1' }
    );
    expect(r).toMatchObject({
      state: 'scored',
      rawPct: 75,
      points: 9,
      max: 12,
      classId: 'c1',
      published: true,
    });
  });
});

describe('scoreProjectMember', () => {
  it('uses a member override over the group points', () => {
    const grade = {
      points: 8,
      maxPoints: 10,
      released: true,
      overridesByUid: { u2: { points: 10 } },
    };
    expect(scoreProjectMember(grade, { classId: 'c1' }, 'u1')).toMatchObject({
      rawPct: 80,
      points: 8,
    });
    expect(scoreProjectMember(grade, { classId: 'c1' }, 'u2')).toMatchObject({
      rawPct: 100,
      points: 10,
      published: true,
    });
  });
});

describe('due dates and rows', () => {
  const session = {
    teacherUid: 't',
    quizTitle: 'Unit 1',
    rosterIds: ['r1', 'r2'],
    classIds: ['c1', 'c2'],
    dueAt: 100,
    periodAccess: { c2: { rosterId: 'r2' } },
  };
  const meta = parseSessionMeta('quiz', 's', session, {
    dueAtByRosterId: { r2: 200 },
  });

  it('resolves pointer, then class, then session due dates', () => {
    expect(effectiveDueAt(meta, 'c1', null)).toBe(100);
    expect(effectiveDueAt(meta, 'c2', null)).toBe(200);
    expect(effectiveDueAt(meta, 'c2', 300)).toBe(300);
  });

  it('flags late work and keeps the roster of the class', () => {
    const score: RowScore = {
      classId: 'c2',
      published: false,
      targetEvidence: [],
      rawPct: 90,
      points: 9,
      max: 10,
      state: 'scored',
      submittedAt: 250,
      attemptNumber: 1,
    };
    const row = assembleRow({
      meta,
      studentUid: 'u',
      score,
      previousAttempts: [],
      assigned: true,
      pointerDueAt: null,
      now: 1,
    });
    expect(row).toMatchObject({
      late: true,
      dueAt: 200,
      rosterId: 'r2',
      title: 'Unit 1',
      ownerUid: 't',
      editorUids: [],
    });
    expect(row.attempts).toEqual([
      { n: 1, pct: 90, points: 9, max: 10, submittedAt: 250 },
    ]);
  });
});

describe('mergeAttempts', () => {
  const s = (over: Partial<RowScore>): RowScore => ({
    classId: null,
    published: false,
    targetEvidence: [],
    rawPct: 50,
    points: 5,
    max: 10,
    state: 'scored',
    submittedAt: 1,
    attemptNumber: 1,
    ...over,
  });

  it('keeps each attempt and replaces a regraded one', () => {
    const one = mergeAttempts([], s({}));
    const two = mergeAttempts(one, s({ attemptNumber: 2, rawPct: 70 }));
    const regraded = mergeAttempts(two, s({ attemptNumber: 2, rawPct: 80 }));
    expect(regraded.map((a) => [a.n, a.pct])).toEqual([
      [1, 50],
      [2, 80],
    ]);
  });

  it('keeps earlier attempts while a retake is in progress', () => {
    const one = mergeAttempts([], s({}));
    expect(
      mergeAttempts(
        one,
        s({ state: 'in-progress', attemptNumber: 2, rawPct: null })
      )
    ).toEqual(one);
  });
});

describe('toMillis', () => {
  it('reads numbers, timestamps and ISO strings', () => {
    expect(toMillis(5)).toBe(5);
    expect(toMillis({ toMillis: () => 7 })).toBe(7);
    expect(toMillis({ seconds: 2 })).toBe(2000);
    expect(toMillis('1970-01-01T00:00:01.000Z')).toBe(1000);
    expect(toMillis(null)).toBeNull();
  });
});
