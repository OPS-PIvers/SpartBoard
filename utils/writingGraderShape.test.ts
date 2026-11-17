import { describe, expect, it } from 'vitest';
import type { Rubric } from '@/types';
import type { WritingDraftWithId } from '@/hooks/useWritingResults';
import type { WritingResultRow } from '@/utils/writingGrading';
import {
  draftAtStep,
  draftBackOf,
  writingFeedbackFromGrade,
  writingGraderQuiz,
  writingGraderResponses,
} from './writingGraderShape';
import { buildGradeFromDraft, isGradeComplete } from './gradeDraft';

const copy = (id: string, number: number, extra = {}) =>
  ({
    id,
    number,
    html: `<p>Draft ${number}</p>`,
    turnedInAt: number * 10,
    ...extra,
  }) as unknown as WritingDraftWithId;

const drafts = new Map([
  [
    'u1',
    [
      copy('1', 1, {
        feedback: { pointsAwarded: 7, gradedBy: 't', gradedAt: 1 },
      }),
      copy('3', 2),
    ],
  ],
  ['u2', [copy('1', 1)]],
]);
const rows = [
  {
    studentUid: 'u1',
    name: 'A, B',
    sortKey: 'a',
    state: 'turned-in',
    response: null,
  },
  {
    studentUid: 'u2',
    name: 'C, D',
    sortKey: 'c',
    state: 'turned-in',
    response: null,
  },
  {
    studentUid: 'u3',
    name: 'E, F',
    sortKey: 'e',
    state: 'draft',
    response: null,
  },
] as WritingResultRow[];

describe('writingGraderShape', () => {
  it('makes one free-response step per copy depth, latest first, with the score total', () => {
    const quiz = writingGraderQuiz(
      {
        id: 's',
        title: 'T',
        prompt: 'P',
        grading: { mode: 'points', points: 20 },
      },
      drafts
    );
    expect(quiz.questions.map((q) => [q.id, q.type, q.points, q.text])).toEqual(
      [
        ['draft-back-0', 'free-response', 20, 'P'],
        ['draft-back-1', 'free-response', 20, 'P'],
      ]
    );
    expect(draftBackOf('draft-back-1')).toBe(1);
    expect(draftBackOf('q1')).toBeNull();
    expect(draftAtStep(drafts.get('u1'), 'draft-back-0')?.id).toBe('3');
    expect(draftAtStep(drafts.get('u2'), 'draft-back-1')).toBeUndefined();
  });

  it('carries the rubric on every step', () => {
    const rubric = {
      id: 'r',
      criteria: [{ id: 'a', levels: [{ points: 4 }] }],
    } as unknown as Rubric;
    const quiz = writingGraderQuiz(
      {
        id: 's',
        title: 'T',
        prompt: 'P',
        grading: { mode: 'rubric', rubricId: 'r', rubricSnapshot: rubric },
      },
      drafts
    );
    expect(quiz.questions[0]).toMatchObject({
      points: 4,
      rubricSnapshot: rubric,
    });
  });

  it('turns each copy into an answer and its feedback into the grade', () => {
    const responses = writingGraderResponses(rows, drafts);
    expect(responses.map((r) => r.studentUid)).toEqual(['u1', 'u2']);
    expect(responses[0].answers.map((a) => a.answer)).toEqual([
      '<p>Draft 2</p>',
      '<p>Draft 1</p>',
    ]);
    expect(responses[0].grading).toEqual({
      'draft-back-1': { pointsAwarded: 7, gradedBy: 't', gradedAt: 1 },
    });
  });

  it('sends comments only on ungraded work and Excused without a score', () => {
    const grade = {
      pointsAwarded: 5,
      overallComment: 'Nice',
      rubricScores: [{ criterionId: 'a', levelId: 'x', points: 5 }],
      gradedBy: 't',
      gradedAt: 1,
    };
    expect(writingFeedbackFromGrade(grade, true)).toEqual({
      overallComment: 'Nice',
    });
    expect(writingFeedbackFromGrade(grade, false)).toEqual({
      overallComment: 'Nice',
      pointsAwarded: 5,
      rubricScores: grade.rubricScores,
    });
    expect(
      writingFeedbackFromGrade({ ...grade, excused: true }, false)
    ).toEqual({
      overallComment: 'Nice',
      excused: true,
    });
    expect(writingFeedbackFromGrade(null, false)).toEqual({});
  });

  it('lets a comments-only grade save without a score', () => {
    const ctx = {
      kind: 'text' as const,
      captureUnavailable: false,
      maxPoints: 1,
      rubricCriteriaCount: 0,
      teacherUid: 't',
      answerText: 'x',
      scoreless: true,
    };
    const draft = {
      pointsInput: '',
      comment: 'Good',
      annotations: [],
      rubricScores: [],
      pinnedTakeIndex: null,
      adjudication: 'none' as const,
    };
    expect(isGradeComplete(draft, ctx)).toBe(true);
    expect(isGradeComplete({ ...draft, comment: '' }, ctx)).toBe(false);
    expect(buildGradeFromDraft(draft, ctx, 1)).toMatchObject({
      ok: true,
      grade: { pointsAwarded: 0, overallComment: 'Good' },
    });
  });
});
