import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  gradeVaAnswer,
  hasEmbeddedKey,
  toVaPublicQuestion,
  vaAnswerRules,
  type VaKeyQuestion,
} from './videoActivityGrade';

interface GradeCase {
  name: string;
  question: VaKeyQuestion;
  answer: string;
  grade?: { pointsAwarded: number };
  isCorrect: boolean;
}

const cases = JSON.parse(
  readFileSync(resolve(__dirname, 'videoActivityGrade.cases.json'), 'utf8')
) as GradeCase[];

describe('video activity grader (server mirror)', () => {
  it.each(cases)('$name', ({ question, answer, grade, isCorrect }) => {
    expect(gradeVaAnswer(question, answer, grade)).toBe(isCorrect);
  });
});

describe('toVaPublicQuestion', () => {
  it('shows a Drive picture and drops anything else in its place', () => {
    const q = { id: 'q', type: 'SA', text: 't', timestamp: 1 };
    expect(
      toVaPublicQuestion({ ...q, imageDriveFileId: '1AbC-dEf_ghIJ' })
        .imageDriveFileId
    ).toBe('1AbC-dEf_ghIJ');
    expect(
      toVaPublicQuestion({ ...q, imageDriveFileId: 'javascript:x' })
    ).not.toHaveProperty('imageDriveFileId');
  });

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
    expect(
      hasEmbeddedKey([{ id: 'q', type: 'SA', text: 'Why?', correctAnswer: '' }])
    ).toBe(true);
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

interface AnswerRulesCase {
  name: string;
  settings: unknown;
  sessionOptions: unknown;
  expected: Record<string, boolean>;
}

const answerRulesCases = JSON.parse(
  readFileSync(
    resolve(__dirname, 'videoActivityAnswerRules.cases.json'),
    'utf8'
  )
) as AnswerRulesCase[];

describe('vaAnswerRules shared cases', () => {
  it.each(answerRulesCases)(
    '$name',
    ({ settings, sessionOptions, expected }) => {
      expect(vaAnswerRules(settings, sessionOptions)).toEqual({
        showResult: expected.showResult,
        revealAnswer: expected.revealAnswer,
        requireCorrectAnswer: expected.requireCorrectAnswer,
      });
    }
  );
});
