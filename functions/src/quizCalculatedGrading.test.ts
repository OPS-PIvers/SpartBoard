import { describe, expect, it } from 'vitest';
import { parseKeyQuestions, scoreAttempt } from './quizScoreOnSubmit';
import { calcValuesFor, formatCalcAnswer } from './quizCalculated';
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
});
