import { describe, it, expect } from 'vitest';
import type { QuizQuestion, QuizResponse } from '@/types';
import {
  computeQuestionDrilldowns,
  groupAnswersByOption,
  type QuestionDrilldown,
} from '@/utils/quizQuestionDrilldown';

const q = (
  id: string,
  type: QuizQuestion['type'],
  correctAnswer: string,
  extra: Partial<QuizQuestion> = {}
): QuizQuestion =>
  ({
    id,
    type,
    text: `Question ${id}`,
    correctAnswer,
    incorrectAnswers: [],
    timeLimit: 0,
    points: 1,
    ...extra,
  }) as unknown as QuizQuestion;

const response = (
  key: string,
  answers: Record<string, string>,
  extra: Partial<QuizResponse> = {}
): QuizResponse =>
  ({
    studentUid: key,
    _responseKey: key,
    status: 'completed',
    submittedAt: 1,
    tabSwitchWarnings: 0,
    answers: Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
      answeredAt: 1,
    })),
    ...extra,
  }) as unknown as QuizResponse;

const nameOf = (r: QuizResponse) => `Name ${r.studentUid}`;

const drill = (
  questions: QuizQuestion[],
  responses: QuizResponse[],
  id = questions[0].id
): QuestionDrilldown => {
  const d = computeQuestionDrilldowns(questions, responses, nameOf).get(id);
  if (!d) throw new Error(`no drilldown for ${id}`);
  return d;
};

const keys = (list: { responseKey: string }[]) =>
  list.map((s) => s.responseKey);

describe('groupAnswersByOption', () => {
  it('lists every MC option in order and drops answers matching none', () => {
    const groups = groupAnswersByOption(
      q('q1', 'MC', 'A', { incorrectAnswers: ['B', '', 'C'] }),
      [
        { answer: 'b', item: 1 },
        { answer: 'A', item: 2 },
        { answer: 'stale', item: 3 },
      ]
    );
    expect(groups.map((g) => [g.label, g.items])).toEqual([
      ['A', [2]],
      ['B', [1]],
      ['C', []],
    ]);
  });

  it('MA: lists every option once and counts an answer under each option it chose', () => {
    const groups = groupAnswersByOption(
      q('q1', 'MA', 'A|C', { incorrectAnswers: ['B', 'D'] }),
      [
        { answer: 'A|C', item: 1 },
        { answer: 'a|b', item: 2 },
        { answer: '', item: 3 },
      ]
    );
    expect(groups.map((g) => [g.label, g.items, g.isKey])).toEqual([
      ['A', [1, 2], true],
      ['C', [1], true],
      ['B', [2], false],
      ['D', [], false],
    ]);
  });
});

describe('computeQuestionDrilldowns', () => {
  it('MC: counts every option with student lists and marks the correct one', () => {
    const mc = q('q1', 'MC', 'Paris', { incorrectAnswers: ['Rome', 'Oslo'] });
    const d = drill(
      [mc],
      [
        response('s1', { q1: 'Paris' }),
        response('s2', { q1: 'Rome' }),
        response('s3', { q1: 'Paris' }),
      ]
    );
    expect(d.servedCount).toBe(3);
    expect(d.distribution.kind).toBe('options');
    if (d.distribution.kind !== 'options') return;
    expect(
      d.distribution.rows.map((r) => [r.label, r.isCorrect, keys(r.students)])
    ).toEqual([
      ['Paris', true, ['s1', 's3']],
      ['Rome', false, ['s2']],
      ['Oslo', false, []],
    ]);
    expect(keys(d.outcomes.correct)).toEqual(['s1', 's3']);
    expect(keys(d.outcomes.incorrect)).toEqual(['s2']);
    expect(d.outcomes.correct[0].name).toBe('Name s1');
  });

  it('MA: per-option pick counts, key options marked, partial credit bucketed', () => {
    const ma = q('q1', 'MA', 'A|C', {
      incorrectAnswers: ['B', 'D'],
      allowPartialCredit: true,
    });
    const d = drill(
      [ma],
      [
        response('s1', { q1: 'C|A' }),
        response('s2', { q1: 'A' }),
        response('s3', { q1: 'B|D' }),
      ]
    );
    if (d.distribution.kind !== 'options') throw new Error('kind');
    expect(
      d.distribution.rows.map((r) => [r.label, r.isCorrect, keys(r.students)])
    ).toEqual([
      ['A', true, ['s1', 's2']],
      ['C', true, ['s1']],
      ['B', false, ['s3']],
      ['D', false, ['s3']],
    ]);
    expect(keys(d.outcomes.correct)).toEqual(['s1']);
    expect(keys(d.outcomes.partial)).toEqual(['s2']);
    expect(keys(d.outcomes.incorrect)).toEqual(['s3']);
  });

  it('FIB: groups answers after normalization, most common first, accepted marked', () => {
    const fib = q('q1', 'FIB', 'Photosynthesis');
    const d = drill(
      [fib],
      [
        response('s1', { q1: 'photosynthesis' }),
        response('s2', { q1: '  Respiration ' }),
        response('s3', { q1: 'respiration' }),
        response('s4', { q1: 'RESPIRATION' }),
        response('s5', { q1: 'Photosynthesis' }),
      ]
    );
    if (d.distribution.kind !== 'options') throw new Error('kind');
    expect(
      d.distribution.rows.map((r) => [r.label, r.isCorrect, r.students.length])
    ).toEqual([
      ['Respiration', false, 3],
      ['photosynthesis', true, 2],
    ]);
  });

  it('Matching: reports correct share and who missed each pair', () => {
    const matching = q('q1', 'Matching', 'dog:bark|cat:meow');
    const d = drill(
      [matching],
      [
        response('s1', { q1: 'dog:bark|cat:meow' }),
        response('s2', { q1: 'dog:meow|cat:bark' }),
        response('s3', { q1: 'Dog:Bark|cat:bark' }),
      ]
    );
    if (d.distribution.kind !== 'pairs') throw new Error('kind');
    expect(
      d.distribution.rows.map((r) => [
        r.prompt,
        r.answer,
        r.correctCount,
        keys(r.missedBy),
      ])
    ).toEqual([
      ['dog', 'bark', 2, ['s2']],
      ['cat', 'meow', 1, ['s2', 's3']],
    ]);
  });

  it('Ordering: lists the most common wrong orders only, and partial credit gets its own bucket', () => {
    const ordering = q('q1', 'Ordering', 'a|b|c', { allowPartialCredit: true });
    const d = drill(
      [ordering],
      [
        response('s1', { q1: 'a|b|c' }),
        response('s2', { q1: 'b|a|c' }),
        response('s3', { q1: 'b|a|c' }),
        response('s4', { q1: 'c|b|a' }),
      ]
    );
    if (d.distribution.kind !== 'orders') throw new Error('kind');
    expect(d.distribution.rows.map((r) => [r.label, keys(r.students)])).toEqual(
      [
        ['b → a → c', ['s2', 's3']],
        ['c → b → a', ['s4']],
      ]
    );
    expect(keys(d.outcomes.partial)).toEqual(['s2', 's3', 's4']);
    expect(d.outcomes.incorrect).toEqual([]);
    expect(keys(d.outcomes.correct)).toEqual(['s1']);
  });

  it('written: no distribution; graded, ungraded and blank split into outcomes', () => {
    const frq = q('q1', 'free-response', '', { points: 4 });
    const graded = (points: number) => ({
      grading: { q1: { pointsAwarded: points, gradedBy: 't', gradedAt: 1 } },
    });
    const d = drill(
      [frq],
      [
        response('s1', { q1: 'Full answer' }, graded(4) as never),
        response('s2', { q1: 'Half answer' }, graded(2) as never),
        response('s3', { q1: 'Not graded yet' }),
        response('s4', { q1: '<p><br></p>' }),
      ]
    );
    expect(d.distribution.kind).toBe('none');
    expect(keys(d.outcomes.correct)).toEqual(['s1']);
    expect(keys(d.outcomes.partial)).toEqual(['s2']);
    expect(keys(d.outcomes.ungraded)).toEqual(['s3']);
    expect(keys(d.outcomes.noAnswer)).toEqual(['s4']);
    expect(d.servedCount).toBe(4);
    expect(d.commonWrongAnswer).toBeNull();
  });

  it('bank questions: only students served the question are in the denominator', () => {
    const q1 = q('q1', 'MC', 'A', { incorrectAnswers: ['B'] });
    const q2 = q('q2', 'MC', 'A', { incorrectAnswers: ['B'] });
    const responses = [
      response('s1', { q1: 'A' }, { servedQuestionIds: ['q1'] }),
      response('s2', { q2: 'B' }, { servedQuestionIds: ['q2'] }),
      response('s3', { q1: 'B', q2: 'A' }),
    ];
    const d1 = drill([q1, q2], responses, 'q1');
    const d2 = drill([q1, q2], responses, 'q2');
    expect(d1.servedCount).toBe(2);
    expect(keys(d1.outcomes.correct)).toEqual(['s1']);
    expect(keys(d1.outcomes.incorrect)).toEqual(['s3']);
    expect(d1.outcomes.noAnswer).toEqual([]);
    expect(d2.servedCount).toBe(2);
    expect(keys(d2.outcomes.incorrect)).toEqual(['s2']);
  });

  it('no answer: passed-over, missing on a completed attempt; in-progress not yet reached is left out', () => {
    const mc = q('q1', 'MC', 'A', { incorrectAnswers: ['B'] });
    const passed = response('s1', {});
    passed.answers = [
      { questionId: 'q1', answer: '', answeredAt: 1, unresponded: 'passed' },
    ] as QuizResponse['answers'];
    const d = drill(
      [mc],
      [
        passed,
        response('s2', {}),
        response('s3', {}, { status: 'in-progress' }),
        response('s4', { q1: 'A' }, { status: 'joined' }),
        response('s5', { q1: 'A' }),
      ]
    );
    expect(keys(d.outcomes.noAnswer)).toEqual(['s1', 's2']);
    expect(d.servedCount).toBe(3);
  });

  it('excused students leave the denominator', () => {
    const recorded = q('q1', 'free-response', '', {
      recording: {
        prepSeconds: 30,
        limitSeconds: 60,
        prepExpiry: 'armed',
        takeLimit: null,
      },
    } as Partial<QuizQuestion>);
    const d = drill(
      [recorded],
      [
        response('s1', { q1: 'Answer' }, {
          grading: {
            q1: { pointsAwarded: 0, excused: true, gradedBy: 't', gradedAt: 1 },
          },
        } as never),
        response('s2', { q1: 'Answer' }),
      ]
    );
    expect(keys(d.outcomes.excused)).toEqual(['s1']);
    expect(d.servedCount).toBe(1);
  });

  it('flags a wrong answer drawn by at least 40% of students served', () => {
    const mc = q('q1', 'MC', 'A', { incorrectAnswers: ['B', 'C'] });
    const flagged = drill(
      [mc],
      [
        response('s1', { q1: 'A' }),
        response('s2', { q1: 'A' }),
        response('s3', { q1: 'A' }),
        response('s4', { q1: 'B' }),
        response('s5', { q1: 'B' }),
      ]
    );
    expect(flagged.commonWrongAnswer).toEqual({ label: 'B', count: 2 });

    const notFlagged = drill(
      [mc],
      [
        response('s1', { q1: 'A' }),
        response('s2', { q1: 'A' }),
        response('s3', { q1: 'A' }),
        response('s4', { q1: 'B' }),
        response('s5', { q1: 'C' }),
        response('s6', {}),
      ]
    );
    expect(notFlagged.commonWrongAnswer).toBeNull();
  });
});
