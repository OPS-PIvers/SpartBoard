import { describe, it, expect } from 'vitest';
import { gradeAnswer } from '@/hooks/useQuizSession';
import type { QuizQuestion, WrittenAnswerGrade } from '@/types';

const q = (overrides: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  text: 'Explain photosynthesis.',
  timeLimit: 0,
  type: 'essay',
  correctAnswer: '',
  incorrectAnswers: [],
  points: 10,
  ...overrides,
});

const grade = (
  overrides: Partial<WrittenAnswerGrade> = {}
): WrittenAnswerGrade => ({
  pointsAwarded: 0,
  gradedBy: 'teacher-uid',
  gradedAt: 0,
  ...overrides,
});

describe('gradeAnswer — written types', () => {
  it('returns ungraded (0 points, isCorrect=false) when no manual grade exists for an essay', () => {
    const result = gradeAnswer(q({ type: 'essay', points: 10 }), '<p>...</p>');
    expect(result).toEqual({
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 10,
    });
  });

  it('returns ungraded when no manual grade exists for a short-answer', () => {
    const result = gradeAnswer(q({ type: 'short', points: 5 }), 'my answer');
    expect(result).toEqual({ isCorrect: false, pointsEarned: 0, pointsMax: 5 });
  });

  it('returns awarded points when a manual grade is supplied', () => {
    const result = gradeAnswer(
      q({ type: 'essay', points: 10 }),
      '<p>...</p>',
      grade({ pointsAwarded: 7 })
    );
    expect(result.pointsEarned).toBe(7);
    expect(result.pointsMax).toBe(10);
  });

  it('flags isCorrect when awarded points equal max', () => {
    const result = gradeAnswer(
      q({ type: 'short', points: 4 }),
      'answer',
      grade({ pointsAwarded: 4 })
    );
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(4);
  });

  it('does NOT flag isCorrect when awarded < max', () => {
    const result = gradeAnswer(
      q({ type: 'short', points: 4 }),
      'answer',
      grade({ pointsAwarded: 3 })
    );
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(3);
  });

  it('clamps awarded points to question max', () => {
    const result = gradeAnswer(
      q({ type: 'essay', points: 5 }),
      '<p>...</p>',
      grade({ pointsAwarded: 99 })
    );
    expect(result.pointsEarned).toBe(5);
    expect(result.pointsMax).toBe(5);
    expect(result.isCorrect).toBe(true);
  });

  it('clamps negative awarded points to zero', () => {
    const result = gradeAnswer(
      q({ type: 'essay', points: 5 }),
      '<p>...</p>',
      grade({ pointsAwarded: -3 })
    );
    expect(result.pointsEarned).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('ignores manualGrade for auto-graded MC questions', () => {
    const result = gradeAnswer(
      q({ type: 'MC', correctAnswer: 'A', points: 2 }),
      'A',
      grade({ pointsAwarded: 0 })
    );
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(2);
  });
});

describe('gradeAnswer — Matching partial-credit isCorrect consistency', () => {
  // Regression for the bug where a student who matched every correct prompt
  // but also submitted extra wrong pairs received isCorrect:false while
  // pointsEarned equalled pointsMax.  The partial-credit formula awards
  // (matched/total)*max — it intentionally does NOT penalise extra pairs —
  // so isCorrect must be derived from pointsEarned, not from the strict
  // "no-extra-pairs" predicate that applies to the non-partial path.
  const matchQ = (pts: number): QuizQuestion => ({
    id: 'pm-regression',
    timeLimit: 0,
    text: 'Match',
    type: 'Matching',
    correctAnswer: 'dog:bark|cat:meow',
    incorrectAnswers: [],
    points: pts,
    allowPartialCredit: true,
  });

  it('all-correct pairs + extra wrong pair: isCorrect=true and pointsEarned=max', () => {
    // Previously returned isCorrect:false, pointsEarned:max — a contradictory
    // state that caused results dashboards to show "incorrect" for a
    // full-credit submission.
    const result = gradeAnswer(matchQ(2), 'dog:bark|cat:meow|cow:wrong');
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(2);
    expect(result.pointsMax).toBe(2);
  });

  it('partial match (1/2 correct) + extra wrong pair: isCorrect=false, pointsEarned=half', () => {
    const result = gradeAnswer(matchQ(4), 'dog:bark|cat:wrong|cow:extra');
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBeCloseTo(2, 5); // 1/2 * 4
  });

  it('exact all-correct (no extras): isCorrect=true, pointsEarned=max', () => {
    const result = gradeAnswer(matchQ(2), 'dog:bark|cat:meow');
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(2);
  });

  it('isCorrect and pointsEarned are always consistent: isCorrect ↔ pointsEarned >= max (max > 0)', () => {
    const cases = [
      'dog:bark|cat:meow', // perfect
      'dog:bark|cat:meow|cow:wrong', // extras
      'dog:bark', // partial
      'dog:wrong|cat:wrong', // all wrong
      '', // empty
    ];
    for (const answer of cases) {
      const result = gradeAnswer(matchQ(4), answer);
      const expectCorrect = result.pointsEarned >= result.pointsMax;
      expect(result.isCorrect).toBe(expectCorrect);
    }
  });

  it('0-point question with no correct matches is isCorrect=false (not 0 >= 0)', () => {
    // isCorrect derives from `matched === total`, not `pointsEarned >= max`,
    // so a worth-0 question is only correct when every prompt is matched.
    const allWrong = gradeAnswer(matchQ(0), 'dog:wrong|cat:wrong');
    expect(allWrong.isCorrect).toBe(false);
    expect(allWrong.pointsEarned).toBe(0);

    const allRight = gradeAnswer(matchQ(0), 'dog:bark|cat:meow');
    expect(allRight.isCorrect).toBe(true);
    expect(allRight.pointsEarned).toBe(0);
  });
});

describe('gradeAnswer — Matching non-partial strict correctness vs duplicate pairs', () => {
  // Regression for the bug where `strictCorrect` compared the answer key size
  // against the RAW submitted pair count (`givenPairs.length`) instead of the
  // count of unique submitted prompts (`seenLefts.size`). A duplicate pair
  // inflated `givenPairs.length` past `total`, forcing strictCorrect=false and
  // awarding 0 points in non-partial mode even though every unique prompt was
  // answered correctly.
  const strictQ = (pts: number): QuizQuestion => ({
    id: 'sm-regression',
    timeLimit: 0,
    text: 'Match',
    type: 'Matching',
    correctAnswer: 'dog:bark|cat:meow',
    incorrectAnswers: [],
    points: pts,
    allowPartialCredit: false,
  });

  it('all unique prompts correct but a duplicate pair submitted: isCorrect=true, full credit', () => {
    // Previously returned isCorrect:false, pointsEarned:0 because
    // givenPairs.length (3) !== total (2).
    const result = gradeAnswer(strictQ(2), 'dog:bark|cat:meow|dog:bark');
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(2);
    expect(result.pointsMax).toBe(2);
  });

  it('exact all-correct (no duplicates): isCorrect=true, full credit', () => {
    const result = gradeAnswer(strictQ(2), 'dog:bark|cat:meow');
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(2);
  });

  it('extra DISTINCT prompt not in the answer key still rejects strict correctness', () => {
    // seenLefts.size (3) !== total (2) — extra distinct prompts must still fail.
    const result = gradeAnswer(strictQ(2), 'dog:bark|cat:meow|cow:moo');
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });
});
