import { describe, expect, it } from 'vitest';
import type { CalcSpec, QuizQuestion, QuizResponse } from '@/types';
import { gradeAnswer, toPublicQuestion } from '@/hooks/useQuizSession';
import { withCalcRevealed } from '@/hooks/quizAssignments/publishGrading';
import {
  fillCalcPublicQuestion,
  questionForResponse,
  sampleCalcQuestion,
  withAttemptCalcAnswers,
} from '@/utils/quizCalcResponse';
import {
  calcAttemptKey,
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
    const revealed = withCalcRevealed({ other: 'x' }, [q], key, {
      status: 'completed',
      completedAttempts: 1,
    });
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

  it('gives each attempt new numbers and grades each attempt on its own', () => {
    const key = 'pin-Period 1-1001';
    const first = { ...response(key), completedAttempts: 1 } as QuizResponse;
    const secondInProgress = {
      ...response(key),
      status: 'in-progress',
      completedAttempts: 1,
    } as QuizResponse;
    const second = { ...response(key), completedAttempts: 2 } as QuizResponse;
    expect(calcAttemptKey(key, first)).toBe(key);
    expect(calcAttemptKey(key, secondInProgress)).toBe(`${key}#2`);
    expect(calcAttemptKey(key, second)).toBe(`${key}#2`);
    const one = questionForResponse(q, first).calcValues;
    const two = questionForResponse(q, second).calcValues;
    expect(two).not.toEqual(one);
    expect(questionForResponse(q, secondInProgress).calcValues).toEqual(two);
    if (!one || !two) throw new Error('no values');
    const firstAnswer = formatCalcAnswer(calc, one);
    expect(
      gradeAnswer(questionForResponse(q, first), firstAnswer).isCorrect
    ).toBe(true);
    expect(
      gradeAnswer(questionForResponse(q, second), firstAnswer).isCorrect
    ).toBe(false);
  });

  it("swaps in an earlier attempt's answers and drops the rest", () => {
    const pub = toPublicQuestion(q);
    expect(
      withAttemptCalcAnswers({ q1: 'live', q2: 'x' }, [pub], { q1: 'old' })
    ).toEqual({ q1: 'old', q2: 'x' });
    expect(withAttemptCalcAnswers({ q1: 'live' }, [pub], undefined)).toEqual(
      {}
    );
  });

  it('previews with sample numbers and their own answer', () => {
    const preview = sampleCalcQuestion(q);
    expect(preview.text).not.toContain('{d}');
    expect(gradeAnswer(preview, preview.correctAnswer).isCorrect).toBe(true);
  });

  it('gives new numbers when the quiz is assigned again', () => {
    const key = 'uid-xyz';
    const first = { ...response(key), joinedAt: 1000 };
    const again = { ...response(key), joinedAt: 2000 };
    expect(questionForResponse(q, again).calcValues).not.toEqual(
      questionForResponse(q, first).calcValues
    );
    expect(
      calcAttemptKey(key, {
        ...first,
        status: 'in-progress',
        completedAttempts: 1,
      })
    ).toBe(`${key}@1000#2`);
  });

  describe('a modified version with typed numbers', () => {
    const modQ: QuizQuestion = {
      ...q,
      modifiedText:
        'A car goes 60 km in 2 hours. How fast does it go each hour?',
      calc: { ...calc, modifiedAnswer: '30' },
    };
    const key = 'uid-mod';
    const r = {
      ...response(key),
      studentUid: 'mod-student',
      answers: [{ questionId: 'q1', answer: '30', answeredAt: 1 }],
    } as unknown as QuizResponse;
    const overrides = {
      overridesByStudentUid: { 'mod-student': { modifiedQuestions: true } },
    };

    it('grades a modified student on the typed-number answer', () => {
      expect(
        gradeAnswer(questionForResponse(modQ, r, overrides), '30 km/h')
          .isCorrect
      ).toBe(true);
      expect(gradeAnswer(questionForResponse(modQ, r), '30').isCorrect).toBe(
        false
      );
    });

    it('keeps random numbers when the modified version uses the number links', () => {
      const linked = { ...modQ, modifiedText: 'Speed for {d} km in {t} h?' };
      expect(questionForResponse(linked, r, overrides).calcValues).toEqual(
        calcValuesFor(q, key)
      );
    });

    it('publishes and shows the typed-number answer to that student', () => {
      expect(
        withCalcRevealed(
          {},
          [modQ],
          key,
          { status: 'completed', completedAttempts: 1 },
          true
        )
      ).toEqual({ q1: '30.00 km/h' });
      const [line] = computeStudentDrilldown([modQ], r, undefined, {
        modified: overrides,
      }).lines;
      expect(line.correctAnswerText).toBe('30.00 km/h');
      expect(line.text).toBe(modQ.modifiedText);
    });
  });
});
