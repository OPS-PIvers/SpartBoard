// Unit tests for Mini App result parsing, privacy filtering and grading (MINI_APP_RESULTS.md D3, D7, D11).
import { describe, it, expect } from 'vitest';
import {
  MiniAppResultError,
  gradeAnswer,
  gradeMiniAppResult,
  parseMiniAppResult,
  readAnswerKey,
  readManifest,
  stripPrivateFields,
  type AnswerKeyEntry,
  type ManifestQuestion,
  type MiniAppQuestionType,
} from './miniAppGrading';

describe('parseMiniAppResult', () => {
  it('accepts the standard shape', () => {
    expect(
      parseMiniAppResult({
        items: [{ id: 'q1', answer: 'B', correct: true, points: 2 }],
        score: 2,
        maxScore: 2,
        data: { seconds: 40 },
      })
    ).toEqual({
      items: [{ id: 'q1', answer: 'B', correct: true, points: 2 }],
      score: 2,
      maxScore: 2,
      data: { seconds: 40 },
    });
  });

  it.each([
    ['a non-object', 'done'],
    ['items that is not a list', { items: 'q1' }],
    ['an item without an id', { items: [{ answer: 1 }] }],
    ['a repeated id', { items: [{ id: 'a' }, { id: 'a' }] }],
    ['a non-boolean correct', { items: [{ id: 'a', correct: 'yes' }] }],
    ['a negative score', { score: -1 }],
    ['a zero maxScore', { maxScore: 0 }],
    ['non-object data', { data: [1, 2] }],
    [
      'more than 200 items',
      { items: Array.from({ length: 201 }, (_, i) => ({ id: `q${i}` })) },
    ],
    ['more than 20 KB', { data: { blob: 'x'.repeat(21_000) } }],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseMiniAppResult(raw)).toThrow(MiniAppResultError);
  });
});

describe('stripPrivateFields', () => {
  it('drops name and email keys and email-like strings at any depth', () => {
    expect(
      stripPrivateFields({
        firstName: 'Ada',
        student_name: 'Ada L',
        Email: 'x',
        name: 'Ada',
        shape: 'triangle',
        nested: { contactEmail: 'a', note: 'ada@school.org', ok: 1 },
        list: ['ada@school.org', 'fine'],
      })
    ).toEqual({
      shape: 'triangle',
      nested: { ok: 1 },
      list: ['fine'],
    });
  });

  it('keeps answers, choices and scores', () => {
    const value = { items: [{ id: 'q1', answer: ['a', 'b'] }], score: 3 };
    expect(stripPrivateFields(value)).toEqual(value);
  });
});

describe('gradeAnswer', () => {
  it.each([
    ['mc', { correct: 'B' }, 'B', true],
    ['mc', { correct: 'B' }, 'b', false],
    ['mc', { correct: 2 }, '2', true],
    ['tf', { correct: true }, 'true', true],
    ['tf', { correct: false }, true, false],
    ['multi', { correct: ['a', 'c'] }, ['c', 'a'], true],
    ['multi', { correct: ['a', 'c'] }, ['a'], false],
    ['multi', { correct: ['a', 'c'] }, ['a', 'c', 'd'], false],
    ['numeric', { correct: 3.14, tolerance: 0.01 }, 3.141, true],
    ['numeric', { correct: 3.14, tolerance: 0.01 }, '3.2', false],
    ['numeric', { correct: 10 }, '10', true],
    ['numeric', { correct: 10 }, '', false],
    [
      'short',
      { accepted: ['George Washington'] },
      '  george   washington ',
      true,
    ],
    ['short', { correct: 'Paris' }, 'paris', true],
    ['short', { accepted: ['Paris'] }, 'Lyon', false],
    ['order', { correct: ['a', 'b', 'c'] }, ['a', 'b', 'c'], true],
    ['order', { correct: ['a', 'b', 'c'] }, ['b', 'a', 'c'], false],
  ] as [MiniAppQuestionType, AnswerKeyEntry, unknown, boolean][])(
    '%s %j vs %j -> %s',
    (type, key, answer, expected) => {
      expect(gradeAnswer(type, key, answer)).toBe(expected);
    }
  );
});

const MANIFEST: ManifestQuestion[] = [
  { id: 'q1', type: 'mc', prompt: 'One', points: 2 },
  { id: 'q2', type: 'numeric', prompt: 'Two' },
  { id: 'q3', type: 'other', prompt: 'Three' },
];

describe('gradeMiniAppResult', () => {
  const key = readAnswerKey({
    questions: { q1: { correct: 'B' }, q2: { correct: 4, tolerance: 0 } },
  });

  it('grades keyed questions on the server and ignores the app claim', () => {
    const outcome = gradeMiniAppResult(
      parseMiniAppResult({
        items: [
          { id: 'q1', answer: 'A', correct: true },
          { id: 'q2', answer: 4 },
        ],
      }),
      MANIFEST,
      key
    );
    expect(outcome.score).toBe(1);
    expect(outcome.maxScore).toBe(3);
    expect(outcome.gradedBy).toBe('server');
    expect(outcome.items.map((i) => [i.id, i.correct])).toEqual([
      ['q1', false],
      ['q2', true],
    ]);
  });

  it('marks a skipped keyed question wrong', () => {
    const outcome = gradeMiniAppResult(
      parseMiniAppResult({ items: [{ id: 'q2', answer: 4 }] }),
      MANIFEST,
      key
    );
    expect(outcome.score).toBe(1);
    expect(outcome.maxScore).toBe(3);
  });

  it('uses the app correct for unkeyed questions and labels the attempt from app', () => {
    const outcome = gradeMiniAppResult(
      parseMiniAppResult({
        items: [
          { id: 'q1', answer: 'B' },
          { id: 'q3', answer: 'essay', correct: true },
        ],
      }),
      MANIFEST,
      key
    );
    expect(outcome.score).toBe(3);
    expect(outcome.maxScore).toBe(4);
    expect(outcome.gradedBy).toBe('app');
  });

  it('rejects an item that is not in the manifest', () => {
    expect(() =>
      gradeMiniAppResult(
        parseMiniAppResult({ items: [{ id: 'q9', answer: 1 }] }),
        MANIFEST,
        key
      )
    ).toThrow(MiniAppResultError);
  });

  it('falls back to the app score when nothing is gradable', () => {
    expect(
      gradeMiniAppResult(
        parseMiniAppResult({ score: 7, maxScore: 10 }),
        [],
        new Map()
      )
    ).toMatchObject({ score: 7, maxScore: 10, gradedBy: 'app' });
  });

  it('returns no score for a result with nothing to grade', () => {
    expect(
      gradeMiniAppResult(
        parseMiniAppResult({ data: { done: true } }),
        [],
        new Map()
      )
    ).toMatchObject({ score: null, maxScore: null, gradedBy: null });
  });
});

describe('readManifest', () => {
  it('drops malformed and duplicate questions', () => {
    expect(
      readManifest({
        questions: [
          { id: 'a', type: 'mc', prompt: 'A' },
          { id: 'a', type: 'tf', prompt: 'dup' },
          { id: 'b', type: 'essay', prompt: 'bad type' },
          'nope',
        ],
      })
    ).toEqual([{ id: 'a', type: 'mc', prompt: 'A' }]);
  });
});
