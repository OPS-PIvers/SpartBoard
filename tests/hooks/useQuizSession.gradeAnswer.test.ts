import { describe, it, expect } from 'vitest';
import {
  gradeAnswer,
  isWrittenAnswerAwaitingGrade,
} from '@/hooks/useQuizSession';
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

const rubricQuestion = (criterionIds: string[]): QuizQuestion =>
  q({
    type: 'essay',
    points: 6,
    rubricSnapshot: {
      id: 'rub-1',
      title: 'DBQ',
      criteria: criterionIds.map((id) => ({
        id,
        name: id,
        levels: [
          { id: `${id}-lo`, label: 'Below', points: 0 },
          { id: `${id}-hi`, label: 'Meets', points: 3 },
        ],
      })),
      createdAt: 0,
      updatedAt: 0,
    },
  });

describe('gradeAnswer — written types', () => {
  it('returns awaiting-grade (0 points, isCorrect=false) when no manual grade exists for an essay', () => {
    const result = gradeAnswer(q({ type: 'essay', points: 10 }), '<p>...</p>');
    expect(result).toEqual({
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 10,
      state: 'awaiting-grade',
    });
  });

  it('returns awaiting-grade when no manual grade exists for a short-answer', () => {
    const result = gradeAnswer(q({ type: 'short', points: 5 }), 'my answer');
    expect(result).toEqual({
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 5,
      state: 'awaiting-grade',
    });
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

describe('gradeAnswer — GradeResult.state (M12 3-G)', () => {
  it("a blank written answer with no grade is 'not-attempted', not 'awaiting-grade'", () => {
    expect(gradeAnswer(q({ type: 'essay' }), '').state).toBe('not-attempted');
    expect(gradeAnswer(q({ type: 'short' }), '   ').state).toBe(
      'not-attempted'
    );
  });

  it("an untouched rich-text editor ('<p><br></p>') is 'not-attempted'", () => {
    // A bare .trim() would read the markup as an attempt and block the whole
    // response from the gradebook push forever.
    expect(gradeAnswer(q({ type: 'essay' }), '<p><br></p>').state).toBe(
      'not-attempted'
    );
    expect(gradeAnswer(q({ type: 'essay' }), '<p>&nbsp;</p>').state).toBe(
      'not-attempted'
    );
    expect(gradeAnswer(q({ type: 'essay' }), '<p>Real text</p>').state).toBe(
      'awaiting-grade'
    );
  });

  it("a saved manual grade makes a written slot 'scored'", () => {
    const result = gradeAnswer(
      q({ type: 'essay', points: 10 }),
      '<p>...</p>',
      grade({ pointsAwarded: 7 })
    );
    expect(result.state).toBe('scored');
  });

  it("an answered auto-graded question is 'scored' whether right or wrong", () => {
    const mc = q({ type: 'MC', correctAnswer: 'A', points: 2 });
    expect(gradeAnswer(mc, 'A').state).toBe('scored');
    expect(gradeAnswer(mc, 'B').state).toBe('scored');
  });

  it("a blank auto-graded answer is 'not-attempted'", () => {
    expect(
      gradeAnswer(q({ type: 'MC', correctAnswer: 'A', points: 2 }), '').state
    ).toBe('not-attempted');
  });

  it("a partial rubric grade stays 'awaiting-grade' even with points awarded", () => {
    const result = gradeAnswer(
      rubricQuestion(['c1', 'c2']),
      'my essay',
      grade({
        pointsAwarded: 3,
        rubricScores: [{ criterionId: 'c1', levelId: 'c1-hi', points: 3 }],
      })
    );
    expect(result.state).toBe('awaiting-grade');
    // The points still persist — a partial save is stored, not discarded.
    expect(result.pointsEarned).toBe(3);
  });

  it("a rubric grade covering every criterion is 'scored'", () => {
    const result = gradeAnswer(
      rubricQuestion(['c1', 'c2']),
      'my essay',
      grade({
        pointsAwarded: 6,
        rubricScores: [
          { criterionId: 'c1', levelId: 'c1-hi', points: 3 },
          { criterionId: 'c2', levelId: 'c2-hi', points: 3 },
        ],
      })
    );
    expect(result.state).toBe('scored');
    expect(result.pointsEarned).toBe(6);
  });

  it("a manual points override with no rubricScores is 'scored', not partial", () => {
    const result = gradeAnswer(
      rubricQuestion(['c1', 'c2']),
      'my essay',
      grade({ pointsAwarded: 5 })
    );
    expect(result.state).toBe('scored');
  });
});

// The student-facing published-score view has no answer key, so it calls this
// detector directly rather than gradeAnswer.
describe('isWrittenAnswerAwaitingGrade', () => {
  it('treats an untouched rich-text editor as not attempted', () => {
    expect(
      isWrittenAnswerAwaitingGrade(undefined, '<p><br></p>', undefined)
    ).toBe(false);
    expect(
      isWrittenAnswerAwaitingGrade(undefined, '<p>&nbsp;</p>', undefined)
    ).toBe(false);
    expect(isWrittenAnswerAwaitingGrade(undefined, '   ', undefined)).toBe(
      false
    );
  });

  it('strips nested markup to a fixpoint rather than in one pass', () => {
    expect(isWrittenAnswerAwaitingGrade(undefined, '<<p>>', undefined)).toBe(
      false
    );
    expect(
      isWrittenAnswerAwaitingGrade(undefined, '<<p>p<br>></p>', undefined)
    ).toBe(false);
  });

  it('keeps prose containing a bare less-than sign', () => {
    expect(
      isWrittenAnswerAwaitingGrade(undefined, '<p>5 < 7 is true</p>', undefined)
    ).toBe(true);
  });

  it('flags a real ungraded answer', () => {
    expect(
      isWrittenAnswerAwaitingGrade(undefined, '<p>Real text</p>', undefined)
    ).toBe(true);
  });

  it('clears once a grade exists', () => {
    expect(
      isWrittenAnswerAwaitingGrade(
        undefined,
        '<p>Real text</p>',
        grade({ pointsAwarded: 4 })
      )
    ).toBe(false);
  });

  it('flags a partial rubric grade when the snapshot is available', () => {
    const q2 = rubricQuestion(['c1', 'c2']);
    expect(
      isWrittenAnswerAwaitingGrade(
        q2,
        '<p>Real text</p>',
        grade({
          pointsAwarded: 3,
          rubricScores: [{ criterionId: 'c1', levelId: 'c1-hi', points: 3 }],
        })
      )
    ).toBe(true);
    expect(
      isWrittenAnswerAwaitingGrade(
        q2,
        '<p>Real text</p>',
        grade({
          pointsAwarded: 6,
          rubricScores: [
            { criterionId: 'c1', levelId: 'c1-hi', points: 3 },
            { criterionId: 'c2', levelId: 'c2-hi', points: 3 },
          ],
        })
      )
    ).toBe(false);
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
