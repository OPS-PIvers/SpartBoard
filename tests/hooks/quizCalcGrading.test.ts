import { describe, expect, it } from 'vitest';
import type { CalcSpec, QuizQuestion, QuizResponse } from '@/types';
import { gradeAnswer, toPublicQuestion } from '@/hooks/useQuizSession';
import { withCalcRevealed } from '@/hooks/quizAssignments/publishGrading';
import {
  fillCalcPublicQuestion,
  questionForResponse,
} from '@/utils/quizCalcResponse';
import {
  calcValuesFor as rawValuesFor,
  formatCalcAnswer,
} from '@/utils/quizCalculated';
import { computeStudentDrilldown } from '@/utils/quizStudentDrilldown';

const calc: CalcSpec = {
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

const q: QuizQuestion = {
  id: 'q1',
  type: 'FIB',
  text: 'A car travels {d} km in {t} hours. Find its speed.',
  correctAnswer: 'd / t',
  incorrectAnswers: [],
  timeLimit: 0,
  points: 2,
  calc,
};

const calcValuesFor = (question: QuizQuestion, key: string) => {
  const values = rawValuesFor(question, key);
  if (!values) throw new Error('no values');
  return values;
};

const response = (key: string): QuizResponse =>
  ({
    _responseKey: key,
    studentUid: 'anon',
    status: 'completed',
    answers: [],
  }) as unknown as QuizResponse;

describe('random-number questions in the app', () => {
  it("grades each student's answer from their own numbers", () => {
    const a = response('pin-Period 1-1001');
    const right = formatCalcAnswer(calc, calcValuesFor(q, 'pin-Period 1-1001'));
    expect(gradeAnswer(questionForResponse(q, a), right).pointsEarned).toBe(2);
    expect(gradeAnswer(questionForResponse(q, a), '1').isCorrect).toBe(false);
    // Without the student's numbers nothing is marked right, not even the formula.
    expect(gradeAnswer(q, 'd / t').isCorrect).toBe(false);
  });

  it('sends students the ranges and seed but never the formula', () => {
    const pub = toPublicQuestion(q);
    expect(pub.calcVariables).toEqual(calc.variables);
    expect(pub.calcSeed).toBe('seed-1');
    expect(JSON.stringify(pub)).not.toContain('d / t');
  });

  it('shows a student the same numbers they are graded on', () => {
    const key = 'uid-xyz';
    const values = calcValuesFor(q, key);
    const filled = fillCalcPublicQuestion(toPublicQuestion(q), key);
    expect(filled.text).toBe(
      `A car travels ${values.d.toFixed(1)} km in ${values.t.toFixed(1)} hours. Find its speed.`
    );
  });

  it("publishes each student's own answer", () => {
    const key = 'uid-xyz';
    const revealed = withCalcRevealed({ other: 'x' }, [q], key);
    expect(revealed).toEqual({
      other: 'x',
      q1: formatCalcAnswer(calc, calcValuesFor(q, key)),
    });
  });

  it("shows the teacher each student's own numbers and answer", () => {
    const key = 'pin-Period 1-1001';
    const values = calcValuesFor(q, key);
    const right = formatCalcAnswer(calc, values);
    const r = {
      ...response(key),
      answers: [{ questionId: 'q1', answer: right, answeredAt: 1 }],
    } as unknown as QuizResponse;
    const [line] = computeStudentDrilldown([q], r).lines;
    expect(line.correctAnswerText).toBe(right);
    expect(line.text).toContain(values.d.toFixed(1));
    expect(line.mark).toBe('correct');
  });
});
