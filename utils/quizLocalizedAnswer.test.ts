import { describe, it, expect, vi, afterEach } from 'vitest';
import type { QuizPublicQuestion } from '@/types';
import { toCanonicalAnswer, toDisplayAnswer } from './quizLocalizedAnswer';

afterEach(() => vi.restoreAllMocks());

const mc: QuizPublicQuestion = {
  id: 'q-mc',
  type: 'MC',
  text: 'Capital?',
  timeLimit: 0,
  choices: ['Rome', 'Paris', 'London'],
  localized: {
    es: { text: '¿Capital?', choices: ['Roma', 'París', 'Londres'] },
  },
};

const ordering: QuizPublicQuestion = {
  id: 'q-order',
  type: 'Ordering',
  text: 'Order',
  timeLimit: 0,
  orderingItems: ['Two', 'One', 'Three'],
  localized: { es: { text: 'Ordena', orderingItems: ['Dos', 'Uno', 'Tres'] } },
};

const matching: QuizPublicQuestion = {
  id: 'q-match',
  type: 'Matching',
  text: 'Match',
  timeLimit: 0,
  matchingLeft: ['Dog', 'Frog'],
  matchingRight: ['Amphibian', 'Mammal', 'Fish'],
  localized: {
    es: {
      text: 'Empareja',
      matchingLeft: ['Perro', 'Rana'],
      matchingRight: ['Anfibio', 'Mamífero', 'Pez'],
    },
  },
};

describe('quizLocalizedAnswer', () => {
  it('round-trips an MC selection', () => {
    expect(toDisplayAnswer(mc, 'es', 'Paris')).toBe('París');
    expect(toCanonicalAnswer(mc, 'es', 'París')).toBe('Paris');
    expect(toCanonicalAnswer(mc, 'es', toDisplayAnswer(mc, 'es', 'Rome'))).toBe(
      'Rome'
    );
  });

  it('round-trips an Ordering sequence', () => {
    const english = 'One|Three|Two';
    const display = toDisplayAnswer(ordering, 'es', english);
    expect(display).toBe('Uno|Tres|Dos');
    expect(toCanonicalAnswer(ordering, 'es', display)).toBe(english);
  });

  it('round-trips Matching pairs, splitting on the first colon only', () => {
    const english = 'Dog:Mammal|Frog:Amphibian';
    const display = toDisplayAnswer(matching, 'es', english);
    expect(display).toBe('Perro:Mamífero|Rana:Anfibio');
    expect(toCanonicalAnswer(matching, 'es', display)).toBe(english);
  });

  it('keeps a definition that itself contains a colon intact', () => {
    const q: QuizPublicQuestion = {
      ...matching,
      matchingRight: ['9:00 AM', 'Mammal', 'Fish'],
      localized: {
        es: {
          text: 'x',
          matchingLeft: ['Perro', 'Rana'],
          matchingRight: ['9:00 h', 'Mamífero', 'Pez'],
        },
      },
    };
    expect(toDisplayAnswer(q, 'es', 'Dog:9:00 AM')).toBe('Perro:9:00 h');
    expect(toCanonicalAnswer(q, 'es', 'Perro:9:00 h')).toBe('Dog:9:00 AM');
  });

  it('is the identity without a locale, or when the question has no entry for it', () => {
    expect(toDisplayAnswer(mc, undefined, 'Paris')).toBe('Paris');
    expect(toCanonicalAnswer(mc, 'hmn', 'Paris')).toBe('Paris');
    const { localized: _drop, ...bare } = mc;
    expect(toDisplayAnswer(bare, 'es', 'Paris')).toBe('Paris');
  });

  it('is the identity for free response and FIB', () => {
    const fr: QuizPublicQuestion = {
      id: 'q-fr',
      type: 'free-response',
      text: 'Explain',
      timeLimit: 0,
      localized: { es: { text: 'Explica' } },
    };
    expect(toDisplayAnswer(fr, 'es', 'my essay')).toBe('my essay');
    expect(toCanonicalAnswer(fr, 'es', 'my essay')).toBe('my essay');
  });

  it('accepts a value already in the target form without mangling it', () => {
    expect(toCanonicalAnswer(mc, 'es', 'Paris')).toBe('Paris');
    expect(toDisplayAnswer(mc, 'es', 'París')).toBe('París');
  });

  it('returns an unmatched value unchanged and reports it once, never throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => toDisplayAnswer(mc, 'es', 'Berlin')).not.toThrow();
    expect(toDisplayAnswer(mc, 'es', 'Berlin')).toBe('Berlin');
    expect(toCanonicalAnswer(mc, 'es', 'Berlín')).toBe('Berlín');
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('is the identity when the arrays are not the same length', () => {
    const q: QuizPublicQuestion = {
      ...mc,
      localized: { es: { text: 'x', choices: ['Roma'] } },
    };
    expect(toDisplayAnswer(q, 'es', 'Paris')).toBe('Paris');
  });
});
