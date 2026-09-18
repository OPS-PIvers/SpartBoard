import { describe, it, expect } from 'vitest';
import type { PaperBatch, QuestionTargetTag } from '@/types';
import type { AssembleResult } from './paperImportAssemble';
import {
  applyTargetsToQuiz,
  fromPendingReview,
  pendingReviewMatches,
  targetsFromQuiz,
  toPendingReview,
  type ReviewState,
} from './paperReviewState';
import { buildPaperStubQuiz } from './paperSheetPlan';

const quiz = buildPaperStubQuiz({
  quizId: 'q',
  title: 'T',
  questionCount: 2,
  choiceCount: 4,
  createdAt: 0,
  newQuestionId: (() => {
    let n = 0;
    return () => `s${(n += 1)}`;
  })(),
});

const batch: PaperBatch = {
  id: 'b1',
  quizId: 'q',
  rosterIds: ['r1'],
  questionCount: 2,
  choiceCount: 4,
  seats: { 1: { rosterId: 'r1', studentId: 's1' } },
  spareSeats: [2],
  keySheetSeat: 3,
  pagesPerSheet: 1,
  createdAt: 0,
};

const assembled: AssembleResult = {
  sheets: [
    {
      seat: 1,
      kind: 'student',
      student: { rosterId: 'r1', studentId: 's1' },
      answers: [
        {
          question: 0,
          choice: 1,
          fills: [0, 0.8, 0, 0],
          crop: { x: 1, y: 2, w: 3, h: 4 },
          scanIndex: 0,
        },
        {
          question: 1,
          choice: null,
          doubt: 'multiple',
          fills: [0.7, 0.7, 0, 0],
          crop: { x: 1, y: 9, w: 3, h: 4 },
          scanIndex: 0,
        },
      ],
      pagesSeen: [1],
      missingPages: [],
      isBlank: false,
      flags: ['doubtful-rows'],
    },
  ],
  keySheet: null,
  unreadablePages: [4],
  foreignPages: [],
  unknownPages: [],
};

const tag: QuestionTargetTag = { id: 't1', kind: 'personal', label: 'Ratios' };

const state: ReviewState = {
  assembled,
  assignmentId: '',
  key: { s1: 1, s2: null },
  keyConfirmed: true,
  spareAssignments: { 2: { rosterId: 'r1', studentId: 's1' } },
  targets: { s1: [tag] },
};

describe('paperReviewState', () => {
  it('round-trips a review through the compact shape, dropping fills and crops', () => {
    const pending = toPendingReview(state, 123);
    expect(pending.savedAt).toBe(123);
    expect(pending.sheets[0].answers).toEqual([
      { question: 0, choice: 1 },
      { question: 1, choice: null, doubt: 'multiple' },
    ]);
    expect(JSON.stringify(pending)).not.toContain('fills');

    const back = fromPendingReview(pending);
    expect(back.assembled.sheets[0].answers[1]).toMatchObject({
      question: 1,
      choice: null,
      doubt: 'multiple',
      fills: [],
      scanIndex: -1,
    });
    expect(back.assembled.unreadablePages).toEqual([4]);
    expect(back.key).toEqual({ s1: 1, s2: null });
    expect(back.keyConfirmed).toBe(true);
    expect(back.spareAssignments).toEqual(state.spareAssignments);
    expect(back.targets).toEqual({ s1: [tag] });
  });

  it('writes review tags onto the quiz and returns the same object when unchanged', () => {
    const tagged = applyTargetsToQuiz(quiz, { s1: [tag] }, 5);
    expect(tagged).not.toBe(quiz);
    expect(tagged.updatedAt).toBe(5);
    expect(tagged.questions[0].targets).toEqual([tag]);
    expect(tagged.questions[1].targets).toBeUndefined();
    expect(targetsFromQuiz(tagged)).toEqual({ s1: [tag] });

    expect(applyTargetsToQuiz(tagged, { s1: [tag] }, 6)).toBe(tagged);
    const cleared = applyTargetsToQuiz(tagged, {}, 7);
    expect(cleared.questions[0].targets).toBeUndefined();
  });

  it('refuses a parked review whose seats or rows the batch never printed', () => {
    const pending = toPendingReview(state, 1);
    expect(pendingReviewMatches(batch, pending)).toBe(true);
    expect(pendingReviewMatches({ ...batch, questionCount: 1 }, pending)).toBe(
      false
    );
    expect(
      pendingReviewMatches({ ...batch, seats: {}, spareSeats: [] }, pending)
    ).toBe(false);
  });
});
