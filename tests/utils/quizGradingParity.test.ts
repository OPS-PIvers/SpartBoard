import { describe, expect, it } from 'vitest';
import { gradeAnswer } from '@/hooks/useQuizSession';
import {
  gradeGroupAnswer,
  FIB_BLANK_SEP as SERVER_SEP,
  type GroupQuestion,
} from '@/functions/src/plcAssessmentMath';
import { FIB_BLANK_SEP } from '@/utils/quizFibBlanks';
import type { QuizQuestion } from '@/types';

interface Case {
  name: string;
  q: Partial<QuizQuestion> & Pick<QuizQuestion, 'type' | 'correctAnswer'>;
  answers: string[];
  accepted?: string[];
}

const S = FIB_BLANK_SEP;

const cases: Case[] = [
  {
    name: 'MC',
    q: {
      type: 'MC',
      correctAnswer: 'Paris',
      incorrectAnswers: ['Rome', 'Oslo'],
    },
    answers: ['Paris', '  paris ', 'PARIS', 'Rome', '', '   ', 'Pa ris'],
  },
  {
    name: 'MC cyrillic yo',
    q: { type: 'MC', correctAnswer: 'ёлка', incorrectAnswers: ['x'] },
    answers: ['елка', 'ёлка', 'ЁЛКА'],
  },
  {
    name: 'FIB single with alternates and accepted',
    q: {
      type: 'FIB',
      correctAnswer: 'color',
      incorrectAnswers: [],
      alternateAnswers: ['colour'],
    },
    answers: ['color', 'Colour', 'hue', '', ' '],
    accepted: ['couleur'],
  },
  {
    name: 'FIB single answer typed with html',
    q: { type: 'FIB', correctAnswer: 'cat', incorrectAnswers: [] },
    answers: ['<p>cat</p>', '<p></p>', '&nbsp;', 'cat'],
  },
  ...[false, true].map((allowPartialCredit): Case => ({
    name: `FIB multi-blank partial=${allowPartialCredit}`,
    q: {
      type: 'FIB',
      correctAnswer: `red${S}blue${S}green`,
      incorrectAnswers: [],
      blankAlternates: [
        { answers: ['crimson'] },
        { answers: [] },
        { answers: ['lime'] },
      ],
      allowPartialCredit,
    },
    answers: [
      `red${S}blue${S}green`,
      `crimson${S}blue${S}lime`,
      `red${S}x${S}green`,
      `x${S}x${S}x`,
      `${S}${S}`,
      '',
      `red`,
      `RED${S} Blue ${S}`,
    ],
    accepted: [`scarlet${S}navy${S}emerald`],
  })),
  ...[false, true].map((allowPartialCredit): Case => ({
    name: `MA partial=${allowPartialCredit}`,
    q: {
      type: 'MA',
      correctAnswer: 'a|b|c',
      incorrectAnswers: ['d', 'e'],
      allowPartialCredit,
    },
    answers: [
      'a|b|c',
      'c|b|a',
      'a|b',
      'a|b|c|d',
      'd|e',
      'a',
      'a|d',
      '',
      'A|B|C',
      'a|a|b|c',
    ],
  })),
  ...[false, true].map((allowPartialCredit): Case => ({
    name: `Matching partial=${allowPartialCredit}`,
    q: {
      type: 'Matching',
      correctAnswer: 'cat:meow|dog:woof|cow:moo',
      incorrectAnswers: [],
      allowPartialCredit,
    },
    answers: [
      'cat:meow|dog:woof|cow:moo',
      'cow:moo|cat:meow|dog:woof',
      'cat:meow|dog:woof',
      'cat:meow|dog:woof|cow:moo|pig:oink',
      'cat:meow|cat:meow|dog:woof|cow:moo',
      'cat:woof|dog:meow|cow:moo',
      'cat|dog|cow',
      '',
      'CAT:MEOW|dog:woof|cow:moo',
      'cat:meow|cat:wrong|dog:woof|cow:moo',
    ],
  })),
  {
    name: 'Matching duplicate lefts in key',
    q: {
      type: 'Matching',
      correctAnswer: 'a:1|a:2|b:3',
      incorrectAnswers: [],
      allowPartialCredit: true,
    },
    answers: ['a:1|b:3', 'a:2|b:3', 'a:2|a:1|b:3'],
  },
  {
    name: 'Matching colon in definition',
    q: {
      type: 'Matching',
      correctAnswer: 'time:10:30|x:y',
      incorrectAnswers: [],
    },
    answers: ['time:10:30|x:y', 'time:10|x:y'],
  },
  ...[false, true].map((allowPartialCredit): Case => ({
    name: `Ordering partial=${allowPartialCredit}`,
    q: {
      type: 'Ordering',
      correctAnswer: 'one|two|three|four',
      incorrectAnswers: [],
      allowPartialCredit,
    },
    answers: [
      'one|two|three|four',
      'four|three|two|one',
      'two|one|three|four',
      'one|three|four',
      'one|two|three|four|five',
      'ONE|Two|three|four',
      '',
      'x|y|z',
    ],
  })),
  {
    name: 'Ordering duplicate items',
    q: {
      type: 'Ordering',
      correctAnswer: 'a|b|a',
      incorrectAnswers: [],
      allowPartialCredit: true,
    },
    answers: ['a|b|a', 'a|a|b', 'b|a|a'],
  },
  {
    name: 'points default and custom',
    q: { type: 'MC', correctAnswer: 'x', incorrectAnswers: ['y'], points: 5 },
    answers: ['x', 'y'],
  },
];

const toServer = (q: Case['q'], id: string): GroupQuestion => ({
  id,
  text: '',
  type: q.type,
  points: q.points ?? 1,
  choices:
    q.type === 'MA' || q.type === 'MC'
      ? [...q.correctAnswer.split('|'), ...(q.incorrectAnswers ?? [])]
      : [],
  correctAnswer: q.correctAnswer,
  alternateAnswers: q.alternateAnswers,
  blankAlternates: q.blankAlternates,
  allowPartialCredit: q.allowPartialCredit === true,
  rubricCriterionIds: [],
  targets: [],
});

const toClient = (q: Case['q'], id: string): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: '',
  incorrectAnswers: [],
  ...q,
});

describe('quiz grading: client gradeAnswer and server gradeGroupAnswer agree', () => {
  it('shares the multi-blank separator', () => {
    expect(SERVER_SEP).toBe(FIB_BLANK_SEP);
  });

  for (const c of cases) {
    describe(c.name, () => {
      for (const answer of c.answers) {
        it(`answer ${JSON.stringify(answer)}`, () => {
          const client = gradeAnswer(
            toClient(c.q, 'q1'),
            answer,
            undefined,
            c.accepted
          );
          const server = gradeGroupAnswer(
            toServer(c.q, 'q1'),
            answer,
            undefined,
            c.accepted
          );
          expect(server.isCorrect).toBe(client.isCorrect);
          expect(server.pointsEarned).toBeCloseTo(client.pointsEarned, 9);
          expect(server.pointsMax).toBe(client.pointsMax);
          expect(server.state).toBe(client.state);
        });
      }
    });
  }

  describe('free-response with a manual grade', () => {
    const q = { type: 'free-response' as const, correctAnswer: '', points: 4 };
    const grades = [
      undefined,
      { pointsAwarded: 4 },
      { pointsAwarded: 2 },
      { pointsAwarded: 9 },
      { pointsAwarded: -1 },
    ];
    for (const g of grades) {
      for (const answer of ['an essay', '']) {
        it(`${JSON.stringify(g)} / ${JSON.stringify(answer)}`, () => {
          const client = gradeAnswer(toClient(q, 'q1'), answer, g as never);
          const server = gradeGroupAnswer(
            toServer(q, 'q1'),
            answer,
            g
              ? { pointsAwarded: g.pointsAwarded, scoredCriterionIds: [] }
              : undefined
          );
          expect(server).toEqual(client);
        });
      }
    }
  });
});
