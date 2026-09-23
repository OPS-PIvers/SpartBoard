import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  gradeVaAnswer,
  hasEmbeddedKey,
  toVaPublicQuestion,
  type VaKeyQuestion,
} from './videoActivityGrade';

interface GradeCase {
  name: string;
  question: VaKeyQuestion;
  answer: string;
  isCorrect: boolean;
}

const cases = JSON.parse(
  readFileSync(resolve(__dirname, 'videoActivityGrade.cases.json'), 'utf8')
) as GradeCase[];

describe('video activity grader (server mirror)', () => {
  it.each(cases)('$name', ({ question, answer, isCorrect }) => {
    expect(gradeVaAnswer(question, answer)).toBe(isCorrect);
  });
});

describe('toVaPublicQuestion', () => {
  it('drops every key field and mixes MC options', () => {
    const pub = toVaPublicQuestion({
      id: 'q1',
      type: 'MC',
      text: 'Capital?',
      timestamp: 12,
      correctAnswer: 'Paris',
      incorrectAnswers: ['Rome', '', 'Oslo'],
      points: 2,
    });
    expect(Object.keys(pub).sort()).toEqual(
      ['id', 'options', 'text', 'timestamp', 'type'].sort()
    );
    expect([...(pub.options ?? [])].sort()).toEqual(['Oslo', 'Paris', 'Rome']);
  });

  it('merges MA correct selections with distractors, deduped', () => {
    const pub = toVaPublicQuestion({
      id: 'q2',
      type: 'MA',
      correctAnswer: 'a| b',
      incorrectAnswers: ['b', 'c'],
    });
    expect([...(pub.options ?? [])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('gives FIB no options', () => {
    const pub = toVaPublicQuestion({
      id: 'q3',
      type: 'FIB',
      correctAnswer: 'x',
      acceptableVariants: ['y'],
    });
    expect(pub.options).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain('"x"');
  });
});

describe('hasEmbeddedKey', () => {
  it('detects legacy keyed questions only', () => {
    expect(hasEmbeddedKey([{ id: 'q', correctAnswer: '' }])).toBe(true);
    expect(hasEmbeddedKey([{ id: 'q', options: ['a'] }])).toBe(false);
    expect(hasEmbeddedKey([])).toBe(false);
    expect(hasEmbeddedKey(undefined)).toBe(false);
  });
});

interface PublicCase {
  name: string;
  question: VaKeyQuestion;
  expected: Record<string, unknown> & { options?: string[] };
}

const publicCases = JSON.parse(
  readFileSync(resolve(__dirname, 'videoActivityPublic.cases.json'), 'utf8')
) as PublicCase[];

describe('toVaPublicQuestion shared cases', () => {
  it.each(publicCases)('$name', ({ question, expected }) => {
    const pub = toVaPublicQuestion(question);
    expect({ ...pub, options: pub.options && [...pub.options].sort() }).toEqual(
      { ...expected, options: expected.options }
    );
  });
});
