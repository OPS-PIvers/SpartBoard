import { describe, it, expect } from 'vitest';
import {
  gradeVideoActivityAnswer,
  computeVideoActivityScorePct,
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
});
