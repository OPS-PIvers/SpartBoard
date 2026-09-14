import { describe, it, expect } from 'vitest';
import type { QuizPublicQuestion } from '@/types';
import {
  alignToPreviousOrder,
  reindexChoiceArray,
} from './quizLocalizedArrays';

const mc = (): QuizPublicQuestion => ({
  id: 'q1',
  type: 'MC',
  text: 'Capital of France?',
  timeLimit: 0,
  choices: ['Paris', 'London', 'Rome'],
  localized: {
    es: { text: '¿Capital de Francia?', choices: ['París', 'Londres', 'Roma'] },
    so: { text: 'Caasimad?', choices: ['Paris-so', 'London-so', 'Rome-so'] },
  },
});

describe('reindexChoiceArray', () => {
  it('applies a permutation to English and to every locale in lockstep', () => {
    const out = reindexChoiceArray(mc(), 'choices', [2, 0, 1]);
    expect(out.choices).toEqual(['Rome', 'Paris', 'London']);
    expect(out.localized?.es.choices).toEqual(['Roma', 'París', 'Londres']);
    expect(out.localized?.so.choices).toEqual([
      'Rome-so',
      'Paris-so',
      'London-so',
    ]);
  });

  it('applies a kept subset to English and to every locale in lockstep', () => {
    const out = reindexChoiceArray(mc(), 'choices', [0, 2]);
    expect(out.choices).toEqual(['Paris', 'Rome']);
    expect(out.localized?.es.choices).toEqual(['París', 'Roma']);
    expect(out.localized?.so.choices).toEqual(['Paris-so', 'Rome-so']);
  });

  it('is the identity fast path when the question has no localized payload', () => {
    const { localized: _drop, ...english } = mc();
    const out = reindexChoiceArray(english, 'choices', [1, 0, 2]);
    expect(out.choices).toEqual(['London', 'Paris', 'Rome']);
    expect(out).not.toHaveProperty('localized');
  });

  it('returns the input untouched when the English array is absent', () => {
    const fib: QuizPublicQuestion = {
      id: 'q',
      type: 'FIB',
      text: 'T',
      timeLimit: 0,
    };
    expect(reindexChoiceArray(fib, 'choices', [0])).toBe(fib);
  });

  it('leaves matchingLeft alone while permuting matchingRight', () => {
    const q: QuizPublicQuestion = {
      id: 'q2',
      type: 'Matching',
      text: 'Match',
      timeLimit: 0,
      matchingLeft: ['Dog', 'Frog'],
      matchingRight: ['Mammal', 'Amphibian', 'Fish'],
      localized: {
        es: {
          text: 'Empareja',
          matchingLeft: ['Perro', 'Rana'],
          matchingRight: ['Mamífero', 'Anfibio', 'Pez'],
        },
      },
    };
    const out = reindexChoiceArray(q, 'matchingRight', [2, 1, 0]);
    expect(out.matchingLeft).toEqual(['Dog', 'Frog']);
    expect(out.localized?.es.matchingLeft).toEqual(['Perro', 'Rana']);
    expect(out.matchingRight).toEqual(['Fish', 'Amphibian', 'Mammal']);
    expect(out.localized?.es.matchingRight).toEqual([
      'Pez',
      'Anfibio',
      'Mamífero',
    ]);
  });

  it('leaves a misaligned locale array untouched rather than reordering it', () => {
    const q = mc();
    q.localized = { es: { text: 'x', choices: ['París', 'Londres'] } };
    const out = reindexChoiceArray(q, 'choices', [2, 1, 0]);
    expect(out.choices).toEqual(['Rome', 'London', 'Paris']);
    expect(out.localized?.es.choices).toEqual(['París', 'Londres']);
  });

  it('never mutates its input', () => {
    const q = mc();
    reindexChoiceArray(q, 'choices', [2, 1, 0]);
    expect(q.choices).toEqual(['Paris', 'London', 'Rome']);
    expect(q.localized?.es.choices).toEqual(['París', 'Londres', 'Roma']);
  });
});

describe('alignToPreviousOrder', () => {
  it('restores the order a live session already served, locales included', () => {
    const previous: QuizPublicQuestion = {
      ...mc(),
      choices: ['Rome', 'Paris', 'London'],
    };
    const out = alignToPreviousOrder(mc(), previous);
    expect(out.choices).toEqual(['Rome', 'Paris', 'London']);
    expect(out.localized?.es.choices).toEqual(['Roma', 'París', 'Londres']);
    expect(out.localized?.so.choices).toEqual([
      'Rome-so',
      'Paris-so',
      'London-so',
    ]);
  });

  it('keeps the fresh shuffle when the English values changed', () => {
    const previous: QuizPublicQuestion = {
      ...mc(),
      choices: ['Rome', 'Paris', 'Berlin'],
    };
    const out = alignToPreviousOrder(mc(), previous);
    expect(out.choices).toEqual(['Paris', 'London', 'Rome']);
  });

  it('is the identity when the session had no matching question', () => {
    const fresh = mc();
    expect(alignToPreviousOrder(fresh, undefined)).toBe(fresh);
  });

  it('leaves a field alone when its English array repeats a label', () => {
    const fresh: QuizPublicQuestion = {
      id: 'q2',
      type: 'Ordering',
      text: 'Order',
      timeLimit: 0,
      orderingItems: ['a', 'a', 'b'],
    };
    const out = alignToPreviousOrder(fresh, {
      ...fresh,
      orderingItems: ['b', 'a', 'a'],
    });
    // The mapping would be ambiguous, so the fresh order stands.
    expect(out.orderingItems).toEqual(['a', 'a', 'b']);
  });
});
