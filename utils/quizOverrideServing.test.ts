import { describe, it, expect } from 'vitest';
import {
  serveQuestionSubset,
  applyHiddenOptions,
  applyTimeMultiplier,
} from './quizOverrideServing';
import type { QuizPublicQuestion } from '@/types';

const q = (id: string, choices?: string[]): QuizPublicQuestion =>
  ({
    id,
    type: 'MC',
    text: `Q ${id}`,
    timeLimit: 30,
    choices,
  }) as QuizPublicQuestion;

describe('serveQuestionSubset', () => {
  it('returns the full array unchanged when questionIds is undefined', () => {
    const all = [q('a'), q('b'), q('c')];
    expect(serveQuestionSubset(all, undefined)).toBe(all);
  });

  it('filters to only the served ids, preserving original order', () => {
    const all = [q('a'), q('b'), q('c')];
    expect(serveQuestionSubset(all, ['c', 'a']).map((x) => x.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('drops ids not present in the subset', () => {
    const all = [q('a'), q('b')];
    expect(serveQuestionSubset(all, ['a']).map((x) => x.id)).toEqual(['a']);
  });
});

describe('applyHiddenOptions', () => {
  it('returns the question unchanged with no hidden map', () => {
    const question = q('q1', ['A', 'B', 'C']);
    expect(applyHiddenOptions(question, undefined)).toBe(question);
  });

  it('returns the question unchanged when the question has no entry', () => {
    const question = q('q1', ['A', 'B', 'C']);
    expect(applyHiddenOptions(question, { q2: ['A'] })).toBe(question);
  });

  it('filters hidden option text out of choices', () => {
    const question = q('q1', ['A', 'B', 'C']);
    const result = applyHiddenOptions(question, { q1: ['B'] });
    expect(result.choices).toEqual(['A', 'C']);
  });

  it('never mutates the original question', () => {
    const question = q('q1', ['A', 'B']);
    applyHiddenOptions(question, { q1: ['A'] });
    expect(question.choices).toEqual(['A', 'B']);
  });
});

describe('applyTimeMultiplier', () => {
  it('leaves 0 (no limit) alone regardless of multiplier', () => {
    expect(applyTimeMultiplier(0, 2)).toBe(0);
    expect(applyTimeMultiplier(0, 'unlimited')).toBe(0);
  });

  it('multiplies by 1.5x and 2x, rounding', () => {
    expect(applyTimeMultiplier(30, 1.5)).toBe(45);
    expect(applyTimeMultiplier(31, 1.5)).toBe(47); // 46.5 -> 47
    expect(applyTimeMultiplier(30, 2)).toBe(60);
  });

  it('returns 0 for unlimited', () => {
    expect(applyTimeMultiplier(30, 'unlimited')).toBe(0);
  });

  it('returns the input unchanged when no multiplier is set', () => {
    expect(applyTimeMultiplier(30, undefined)).toBe(30);
  });
});
