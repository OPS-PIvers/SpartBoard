import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fibLenientMatch, relaxFibAnswer } from './quizFibMatch';
import * as server from '@/functions/src/quizFibMatch';
import {
  ANY_LOCALE,
  fibAcceptedAnswers,
  keepTeacherAccepted,
  lenientLocalesFor,
} from './quizFibAnswers';
import { gradeAnswer } from '@/hooks/useQuizSession';
import {
  gradeGroupAnswer,
  servedFibAnswers,
} from '@/functions/src/plcAssessmentMath';
import { servedFibAnswers as scoreOnSubmitFib } from '@/functions/src/quizScoreOnSubmit';
import type { QuizQuestion } from '@/types';

const CASES: [string, string, string, boolean][] = [
  ['la circunferencia', 'circunferencia', 'es', true],
  ['Circunferéncia', 'circunferencia', 'es', true],
  ['circunferensia', 'circunferencia', 'es', true],
  ['the circumference', 'circumference', 'es', true],
  ['circunfrencia.', 'circunferencia', 'es', true],
  ['radio', 'circunferencia', 'es', false],
  ['sol', 'sal', 'es', false],
  ['31.4 metros', '31.4 metros', 'es', true],
  ['31,4 metros', '31.4 metros', 'es', true],
  ['31.5 metros', '31.4 metros', 'es', false],
  ['31.4 metro', '31.4 metros', 'es', true],
  ['', 'circunferencia', 'es', false],
  ['wareegga', 'wareegga', 'so', true],
  ['wareega', 'wareegga', 'so', true],
];

describe('fibLenientMatch', () => {
  it.each(CASES)('%s vs %s (%s) → %s', (given, key, locale, expected) => {
    expect(fibLenientMatch(given, key, locale)).toBe(expected);
  });

  it('drops one leading article only', () => {
    expect(relaxFibAnswer('La Luna', 'es')).toBe('luna');
  });

  it('the functions copy matches the app on every case', () => {
    for (const [given, key, locale] of CASES)
      expect(server.fibLenientMatch(given, key, locale)).toBe(
        fibLenientMatch(given, key, locale)
      );
    const body = (p: string) =>
      readFileSync(resolve(process.cwd(), p), 'utf8')
        .split('\n')
        .slice(1)
        .join('\n');
    expect(body('functions/src/quizFibMatch.ts')).toBe(
      body('utils/quizFibMatch.ts')
    );
  });
});

const fib = (correctAnswer: string): QuizQuestion =>
  ({
    id: 'q1',
    type: 'FIB',
    text: 'The distance around a circle is called the ____.',
    correctAnswer,
    incorrectAnswers: [],
    points: 1,
  }) as unknown as QuizQuestion;

describe('lenient grading only for a translated student', () => {
  const map = { q1: { es: ['circunferencia'] } };

  it('marks the screenshot answer right for a Spanish student', () => {
    const extras = fibAcceptedAnswers(map, 'q1', 'es', ['es']);
    expect(
      gradeAnswer(fib('circumference'), 'la circunferencia', undefined, extras)
        .isCorrect
    ).toBe(true);
    expect(
      gradeAnswer(fib('circumference'), 'circumferense', undefined, extras)
        .isCorrect
    ).toBe(true);
  });

  it('stays exact without the lenient locale', () => {
    const extras = fibAcceptedAnswers(map, 'q1', 'es', []);
    expect(
      gradeAnswer(fib('circumference'), 'la circunferencia', undefined, extras)
        .isCorrect
    ).toBe(false);
    expect(
      gradeAnswer(fib('circumference'), 'circunferencia', undefined, extras)
        .isCorrect
    ).toBe(true);
  });

  it('stays exact for an English student', () => {
    const extras = fibAcceptedAnswers(map, 'q1', undefined, ['es']);
    expect(
      gradeAnswer(fib('circumference'), 'circumferense', undefined, extras)
        .isCorrect
    ).toBe(false);
  });

  it('the server grader agrees', () => {
    const q = {
      id: 'q1',
      type: 'FIB',
      correctAnswer: 'circumference',
      points: 1,
    } as unknown as Parameters<typeof gradeGroupAnswer>[0];
    const session = {
      localizedFibAnswers: map,
      lenientFibLocales: ['es'],
      overridesByStudentUid: { s1: { language: 'es' }, s2: {} },
    };
    expect(
      gradeGroupAnswer(
        q,
        'la circunferencia',
        undefined,
        servedFibAnswers(session, 's1', 'q1')
      ).isCorrect
    ).toBe(true);
    expect(
      gradeGroupAnswer(
        q,
        'circumferense',
        undefined,
        servedFibAnswers(session, 's2', 'q1')
      ).isCorrect
    ).toBe(false);
    const byQ = scoreOnSubmitFib(
      {
        localizedFibAnswers: map,
        lenientFibLocales: ['es'],
        overridesByStudentUid: { s1: { language: 'es' } },
      },
      's1'
    );
    expect(
      gradeGroupAnswer(q, 'circunferensia', undefined, byQ.q1).isCorrect
    ).toBe(true);
  });
});

describe('teacher-accepted answers', () => {
  const map = { q1: { es: ['circunferencia'], [ANY_LOCALE]: ['perimeter'] } };

  it('count for every student, exactly', () => {
    expect(
      gradeAnswer(
        fib('circumference'),
        'Perimeter',
        undefined,
        fibAcceptedAnswers(map, 'q1', undefined)
      ).isCorrect
    ).toBe(true);
    expect(
      gradeAnswer(
        fib('circumference'),
        'perimetr',
        undefined,
        fibAcceptedAnswers(map, 'q1', undefined)
      ).isCorrect
    ).toBe(false);
    expect(scoreOnSubmitFib({ localizedFibAnswers: map }, 'anyone').q1).toEqual(
      ['perimeter']
    );
  });

  it('survive a key rebuild for questions that still exist', () => {
    expect(
      keepTeacherAccepted({ q1: { es: ['x'] } }, map, new Set(['q1']))
    ).toEqual({ q1: { es: ['x'], [ANY_LOCALE]: ['perimeter'] } });
    expect(keepTeacherAccepted({}, map, new Set())).toEqual({});
  });
});

describe('lenientLocalesFor', () => {
  it('leaves out the quiz language and the accepted list', () => {
    const answers = { q1: { es: ['a'], so: ['b'], [ANY_LOCALE]: ['c'] } };
    expect(lenientLocalesFor(answers, undefined)).toEqual(['es', 'so']);
    expect(lenientLocalesFor(answers, 'es-MX')).toEqual(['so']);
  });
});
