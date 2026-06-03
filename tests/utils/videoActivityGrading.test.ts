import { describe, it, expect } from 'vitest';
import {
  gradeVideoActivityAnswer,
  computeVideoActivityScorePct,
  canScoreVideoActivityResponse,
} from '@/utils/videoActivityGrading';
import type { VideoActivityQuestion } from '@/types';

function q(
  overrides: Partial<VideoActivityQuestion> = {}
): VideoActivityQuestion {
  return {
    id: 'q1',
    text: 'What?',
    timestamp: 30,
    timeLimit: 30,
    type: 'MC',
    correctAnswer: '',
    incorrectAnswers: [],
    points: 1,
    ...overrides,
  };
}

describe('gradeVideoActivityAnswer — MC', () => {
  it('full credit on exact match', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'MC', correctAnswer: 'Saturn', points: 2 }),
      'Saturn'
    );
    expect(result).toEqual({ isCorrect: true, pointsEarned: 2, pointsMax: 2 });
  });

  it('case- and whitespace-insensitive', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'MC', correctAnswer: 'Saturn' }),
      '  saturn  '
    );
    expect(result.isCorrect).toBe(true);
  });

  it('zero credit on miss', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'MC', correctAnswer: 'Saturn', points: 5 }),
      'Mars'
    );
    expect(result).toEqual({ isCorrect: false, pointsEarned: 0, pointsMax: 5 });
  });

  it('fails closed when correctAnswer is empty (un-authored stub)', () => {
    // A blank `correctAnswer` is a misconfigured question. Without the
    // guard, an empty student submission would normalize to '' and grade
    // as correct, awarding undeserved points.
    const blankSubmission = gradeVideoActivityAnswer(
      q({ type: 'MC', correctAnswer: '', points: 3 }),
      ''
    );
    expect(blankSubmission).toEqual({
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 3,
    });
    const realSubmission = gradeVideoActivityAnswer(
      q({ type: 'MC', correctAnswer: '', points: 3 }),
      'Mars'
    );
    expect(realSubmission.isCorrect).toBe(false);
  });
});

describe('gradeVideoActivityAnswer — FIB', () => {
  it('canonical answer matches', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'FIB', correctAnswer: 'mitochondria' }),
      'Mitochondria'
    );
    expect(result.isCorrect).toBe(true);
  });

  it('accepts variants', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'FIB',
        correctAnswer: 'color',
        acceptableVariants: ['colour'],
      }),
      'Colour'
    );
    expect(result.isCorrect).toBe(true);
  });

  it('rejects answers that are neither canonical nor variant', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'FIB',
        correctAnswer: 'color',
        acceptableVariants: ['colour'],
      }),
      'shade'
    );
    expect(result.isCorrect).toBe(false);
  });

  it('treats missing variants as empty list (canonical only)', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'FIB', correctAnswer: 'photosynthesis' }),
      'photosynthesis'
    );
    expect(result.isCorrect).toBe(true);
  });

  it('fails closed when canonical and variants are all blank', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'FIB', correctAnswer: '', acceptableVariants: ['', '   '] }),
      ''
    );
    expect(result).toEqual({ isCorrect: false, pointsEarned: 0, pointsMax: 1 });
  });
});

describe('gradeVideoActivityAnswer — MA', () => {
  it('full credit on exact set match', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'MA',
        correctAnswer: 'a|b|c',
        incorrectAnswers: ['d', 'e'],
        points: 3,
      }),
      'b|a|c'
    );
    expect(result).toEqual({ isCorrect: true, pointsEarned: 3, pointsMax: 3 });
  });

  it('zero credit when missing one correct selection (no partial credit)', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'MA',
        correctAnswer: 'a|b|c',
        incorrectAnswers: ['d'],
        points: 3,
      }),
      'a|b'
    );
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });

  it('zero credit when over-selecting (includes a wrong option)', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'MA',
        correctAnswer: 'a|b',
        incorrectAnswers: ['c', 'd'],
      }),
      'a|b|c'
    );
    expect(result.isCorrect).toBe(false);
  });

  it('partial credit awards proportional points', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'MA',
        correctAnswer: 'a|b|c|d',
        incorrectAnswers: ['e'],
        allowPartialCredit: true,
        points: 4,
      }),
      'a|b'
    );
    // 2 correct picks, 0 wrong picks, 4 needed -> 2/4 * 4 = 2
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(2);
  });

  it('partial credit penalizes wrong picks', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'MA',
        correctAnswer: 'a|b|c|d',
        incorrectAnswers: ['e', 'f'],
        allowPartialCredit: true,
        points: 4,
      }),
      'a|b|e|f'
    );
    // 2 correct, 2 wrong, 4 needed -> (2-2)/4 * 4 = 0
    expect(result.pointsEarned).toBe(0);
  });

  it('partial credit floors at zero', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'MA',
        correctAnswer: 'a|b',
        incorrectAnswers: ['c', 'd', 'e', 'f'],
        allowPartialCredit: true,
        points: 4,
      }),
      'c|d|e|f'
    );
    // 0 correct, 4 wrong, 2 needed -> max(0, (0-4)/2) * 4 = 0
    expect(result.pointsEarned).toBe(0);
  });

  it('case- and whitespace-insensitive on MA selections', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'MA',
        correctAnswer: 'Apple|Banana',
        incorrectAnswers: ['Cherry'],
      }),
      'banana | APPLE'
    );
    expect(result.isCorrect).toBe(true);
  });
});

describe('gradeVideoActivityAnswer — Unicode normalization (VA-specific)', () => {
  it('treats accented and unaccented as equivalent (FIB)', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'FIB', correctAnswer: 'café' }),
      'cafe'
    );
    expect(result.isCorrect).toBe(true);
  });

  it('reverse direction also works — accented student, unaccented canonical', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'FIB', correctAnswer: 'naive' }),
      'naïve'
    );
    expect(result.isCorrect).toBe(true);
  });

  it('strips combining marks across MA option compare', () => {
    const result = gradeVideoActivityAnswer(
      q({
        type: 'MA',
        correctAnswer: 'résumé|élève',
        incorrectAnswers: ['école'],
      }),
      'resume|eleve'
    );
    expect(result.isCorrect).toBe(true);
  });
});

describe('gradeVideoActivityAnswer — defensive defaults', () => {
  it('treats missing type as MC', () => {
    const result = gradeVideoActivityAnswer(
      // type left out — pre-PR2a Drive blob shape
      // @ts-expect-error intentional missing field
      { ...q({ correctAnswer: 'Earth' }), type: undefined },
      'Earth'
    );
    expect(result.isCorrect).toBe(true);
  });

  it('defaults points to 1 when missing', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'MC', correctAnswer: 'X', points: undefined }),
      'X'
    );
    expect(result.pointsMax).toBe(1);
    expect(result.pointsEarned).toBe(1);
  });

  it('points: 0 produces zero pointsEarned and pointsMax', () => {
    const result = gradeVideoActivityAnswer(
      q({ type: 'MC', correctAnswer: 'X', points: 0 }),
      'X'
    );
    expect(result.isCorrect).toBe(true);
    expect(result.pointsEarned).toBe(0);
    expect(result.pointsMax).toBe(0);
  });

  it('unknown type fails closed', () => {
    const result = gradeVideoActivityAnswer(
      // Cast through unknown so the test can simulate a corrupt save.
      {
        ...q(),
        type: 'BOGUS' as unknown as VideoActivityQuestion['type'],
      },
      'anything'
    );
    expect(result.isCorrect).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });
});

describe('computeVideoActivityScorePct', () => {
  const questions = [
    q({ id: 'q1', type: 'MC', correctAnswer: 'a', points: 1 }),
    q({
      id: 'q2',
      type: 'MA',
      correctAnswer: 'x|y',
      incorrectAnswers: ['z'],
      points: 4,
    }),
    q({ id: 'q3', type: 'FIB', correctAnswer: 'photosynthesis', points: 2 }),
  ];

  it('returns 0 when no questions', () => {
    expect(computeVideoActivityScorePct([], [])).toBe(0);
  });

  it('returns 0 when no answers', () => {
    expect(computeVideoActivityScorePct(questions, [])).toBe(0);
  });

  it('computes points-weighted percentage', () => {
    const score = computeVideoActivityScorePct(questions, [
      { questionId: 'q1', answer: 'a' }, // 1/1
      { questionId: 'q2', answer: 'x|y' }, // 4/4
      { questionId: 'q3', answer: 'photosynthesis' }, // 2/2
    ]);
    expect(score).toBe(100); // 7/7
  });

  it('partial-credit MA contributes fractional points', () => {
    const partialQuestions = [
      q({
        id: 'q1',
        type: 'MA',
        correctAnswer: 'a|b|c|d',
        incorrectAnswers: [],
        allowPartialCredit: true,
        points: 4,
      }),
    ];
    const score = computeVideoActivityScorePct(partialQuestions, [
      { questionId: 'q1', answer: 'a|b' },
    ]);
    expect(score).toBe(50); // 2/4 = 50%
  });

  it('credits at most one answer per question', () => {
    const score = computeVideoActivityScorePct(
      [q({ id: 'q1', type: 'MC', correctAnswer: 'a', points: 1 })],
      [
        { questionId: 'q1', answer: 'a' },
        { questionId: 'q1', answer: 'b' }, // would be 0 if counted
      ]
    );
    // First answer wins, no inflation from arrayUnion races
    expect(score).toBe(100);
  });

  it('counts max points only once when questions array contains duplicate ids', () => {
    // Duplicate question ids can appear in questions arrays if upstream data
    // is corrupt (e.g. Drive-sync duplication, arrayUnion race on the template
    // doc). The `seen` guard must protect `max` accumulation as well as answer
    // crediting so that the denominator is not inflated and a correct answer
    // still earns 100 %.
    const score = computeVideoActivityScorePct(
      [
        q({ id: 'q1', type: 'MC', correctAnswer: 'a', points: 2 }),
        q({ id: 'q1', type: 'MC', correctAnswer: 'a', points: 2 }), // duplicate
      ],
      [{ questionId: 'q1', answer: 'a' }] // one correct answer
    );
    // Without the fix: max = 4 (counted twice), earned = 2, score = 50.
    // With the fix:    max = 2 (counted once),  earned = 2, score = 100.
    expect(score).toBe(100);
  });
});

describe('canScoreVideoActivityResponse', () => {
  const qs = [
    q({ id: 'q1', type: 'MC', correctAnswer: 'a' }),
    q({ id: 'q2', type: 'MC', correctAnswer: 'b' }),
  ];

  it('returns false when the question set has not loaded (empty questions)', () => {
    // The teacher Results view scores against `session.questions`; before that
    // hydrates from Firestore every completed response would score a phantom 0.
    expect(
      canScoreVideoActivityResponse([], [{ questionId: 'q1', answer: 'a' }])
    ).toBe(false);
  });

  it('returns true for a response whose answers match loaded questions', () => {
    expect(
      canScoreVideoActivityResponse(qs, [{ questionId: 'q1', answer: 'a' }])
    ).toBe(true);
  });

  it('treats a zero-answer response as scoreable (genuine 0, not a missing key)', () => {
    expect(canScoreVideoActivityResponse(qs, [])).toBe(true);
  });

  it('returns false when no answer maps to a loaded question id (synced ID drift)', () => {
    expect(
      canScoreVideoActivityResponse(qs, [
        { questionId: 'old-q1', answer: 'a' },
        { questionId: 'old-q2', answer: 'b' },
      ])
    ).toBe(false);
  });

  it('returns true when at least one answer maps to a loaded question (partial drift)', () => {
    expect(
      canScoreVideoActivityResponse(qs, [
        { questionId: 'q1', answer: 'a' },
        { questionId: 'old-q2', answer: 'b' },
      ])
    ).toBe(true);
  });
});

describe('class-average / gradebook exclusion (phantom-0 guard)', () => {
  const qs = [q({ id: 'q1', type: 'MC', correctAnswer: 'a', points: 1 })];

  // Mirrors the Results.tsx aggregate loop: a completed response is only folded
  // into the class average when `canScoreVideoActivityResponse` says it can be
  // scored. This is the behavior the monitor relies on so an unscoreable
  // response can't drag the average toward a phantom 0. Returns `null` when
  // nothing is scoreable, which the tile renders as "—" rather than "0%".
  function classAverage(
    questions: VideoActivityQuestion[],
    completed: { answers: { questionId: string; answer: string }[] }[]
  ): number | null {
    let sum = 0;
    let scored = 0;
    for (const r of completed) {
      if (canScoreVideoActivityResponse(questions, r.answers)) {
        sum += computeVideoActivityScorePct(questions, r.answers);
        scored++;
      }
    }
    return scored > 0 ? Math.round(sum / scored) : null;
  }

  it('excludes a drifted (unscoreable) response from the average', () => {
    const scored = { answers: [{ questionId: 'q1', answer: 'a' }] }; // 100%
    const drifted = { answers: [{ questionId: 'gone', answer: 'a' }] }; // phantom 0
    // Without the guard: (100 + 0) / 2 = 50. With it: 100 / 1 = 100.
    expect(classAverage(qs, [scored, drifted])).toBe(100);
  });

  it('yields null (rendered as "—") when the question set has not loaded', () => {
    const r = { answers: [{ questionId: 'q1', answer: 'a' }] };
    // Every response is unscoreable, so the average has no scored members and
    // is null — the tile shows "—" instead of a misleading 0% "everyone failed".
    expect(classAverage([], [r])).toBeNull();
  });

  it('still counts a genuine empty submission as a real 0 in the average', () => {
    const perfect = { answers: [{ questionId: 'q1', answer: 'a' }] }; // 100%
    const empty = { answers: [] as { questionId: string; answer: string }[] }; // real 0
    // A no-answer submission is a true 0, not a missing-key artifact — it stays
    // in the mean: (100 + 0) / 2 = 50.
    expect(classAverage(qs, [perfect, empty])).toBe(50);
  });
});
