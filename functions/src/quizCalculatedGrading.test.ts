import { describe, expect, it } from 'vitest';
import { parseKeyQuestions, scoreAttempt } from './quizScoreOnSubmit';
import {
  calcAttemptKey,
  calcValuesFor,
  formatCalcAnswer,
  parseStudentNumber,
} from './quizCalculated';
import { gradeGroupAnswer } from './plcAssessmentMath';

const calc = {
  seed: 'seed-1',
  variables: [
    { name: 'd', min: 40, max: 120, decimals: 1 },
    { name: 't', min: 1.5, max: 4, decimals: 1 },
  ],
  formula: 'd / t',
  tolerance: { kind: 'relative', percent: 1 },
  roundTo: 2,
  unit: 'km/h',
};

const [question] = parseKeyQuestions([
  {
    id: 'q1',
    type: 'FIB',
    points: 2,
    correctAnswer: 'd / t',
    incorrectAnswers: [],
    calc,
  },
]);

const ctx = { questions: [question], sections: [], fibAnswersByQuestion: {} };

describe('random-number questions on the server', () => {
  it('keeps the formula from the key', () => {
    expect(question.calc?.formula).toBe('d / t');
  });

  it('scores each student against their own numbers', () => {
    for (const key of ['pin-Period 1-1001', 'pin-Period 1-1002', 'uid-abc']) {
      const right = formatCalcAnswer(
        question.calc!,
        calcValuesFor(question, key)!
      ).replace(' km/h', '');
      expect(
        scoreAttempt(
          { answers: [{ questionId: 'q1', answer: right }] },
          ctx,
          key
        )?.score
      ).toBe(100);
      expect(
        scoreAttempt(
          { answers: [{ questionId: 'q1', answer: '0.5' }] },
          ctx,
          key
        )?.score
      ).toBe(0);
    }
  });

  it("won't score without the response key", () => {
    expect(
      scoreAttempt({ answers: [{ questionId: 'q1', answer: '1' }] }, ctx)
    ).toBeNull();
  });

  it('never accepts the formula itself', () => {
    expect(gradeGroupAnswer(question, 'd / t', undefined).state).toBe('no-key');
  });

  it('scores a second attempt against its own new numbers', () => {
    const key = 'uid-abc';
    const values = calcValuesFor(
      question,
      calcAttemptKey(key, { status: 'completed', completedAttempts: 2 })
    );
    if (!question.calc || !values) throw new Error('no values');
    const right = formatCalcAnswer(question.calc, values).replace(' km/h', '');
    const attempt = (n: number) => ({
      status: 'completed',
      completedAttempts: n,
      answers: [{ questionId: 'q1', answer: right }],
    });
    expect(scoreAttempt(attempt(2), ctx, key)?.score).toBe(100);
    expect(scoreAttempt(attempt(1), ctx, key)?.score).toBe(0);
  });

  it('scores a modified student on the typed-number answer', () => {
    const [modified] = parseKeyQuestions([
      {
        id: 'q1',
        type: 'FIB',
        points: 2,
        correctAnswer: 'd / t',
        incorrectAnswers: [],
        calc: { ...calc, modifiedAnswer: '30' },
      },
    ]);
    const modCtx = { ...ctx, questions: [modified], modified: true };
    const attempt = { answers: [{ questionId: 'q1', answer: '30' }] };
    expect(scoreAttempt(attempt, modCtx, 'uid-abc')?.score).toBe(100);
    expect(
      scoreAttempt(attempt, { ...modCtx, modified: false }, 'uid-abc')?.score
    ).toBe(0);
  });

  it('parses typed numbers in linear time on a long digit run', () => {
    const start = performance.now();
    expect(parseStudentNumber(`${'1'.repeat(40000)}a`)).toBeNull();
    expect(parseStudentNumber(`${'1'.repeat(40000)}x10^a`)).toBeNull();
    expect(performance.now() - start).toBeLessThan(200);
    expect(parseStudentNumber('3.2 x 10^4')).toBe(32000);
    expect(parseStudentNumber('12.')).toBe(12);
    expect(parseStudentNumber('-4.5')).toBe(-4.5);
  });
});
