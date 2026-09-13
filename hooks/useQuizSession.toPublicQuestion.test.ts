import { describe, it, expect } from 'vitest';
import type { QuestionTranslation, QuizQuestion } from '@/types';
import { toPublicQuestion } from './useQuizSession';

const mc: QuizQuestion = {
  id: 'q-mc',
  timeLimit: 0,
  type: 'MC',
  text: 'Capital of France?',
  correctAnswer: 'Paris',
  incorrectAnswers: ['London', '', 'Rome', 'Madrid'],
};

const matching: QuizQuestion = {
  id: 'q-match',
  timeLimit: 0,
  type: 'Matching',
  text: 'Match',
  correctAnswer: 'Dog:Mammal|Frog:Amphibian',
  incorrectAnswers: [],
  matchingDistractors: ['Reptile', '', 'Fish'],
};

const ordering: QuizQuestion = {
  id: 'q-order',
  timeLimit: 0,
  type: 'Ordering',
  text: 'Order',
  correctAnswer: 'One|Two|Three|Four',
  incorrectAnswers: [],
};

const mcTranslations: Record<string, QuestionTranslation> = {
  es: {
    text: '¿Capital de Francia?',
    choices: ['París', 'Londres', 'Roma', 'Madrid-es'],
  },
  so: {
    text: 'Caasimadda Faransiiska?',
    choices: ['Paris-so', 'London-so', 'Rome-so', 'Madrid-so'],
  },
};

describe('toPublicQuestion', () => {
  it('emits no new keys at all when `translations` is undefined', () => {
    for (const q of [mc, matching, ordering]) {
      const projected = toPublicQuestion(q);
      expect(projected).not.toHaveProperty('localized');
      expect(Object.keys(projected)).not.toContain('localized');
    }
    expect(toPublicQuestion(mc, {})).not.toHaveProperty('localized');
  });

  it('never puts correctAnswer, incorrectAnswers or matchingDistractors on a locale entry', () => {
    const projected = toPublicQuestion(matching, {
      es: {
        text: 'Empareja',
        matchingLeft: ['Perro', 'Rana'],
        matchingRight: ['Mamífero', 'Anfibio'],
        matchingDistractors: ['Reptil', 'Pez'],
      },
    });
    const entry = projected.localized?.es ?? {};
    expect(entry).not.toHaveProperty('matchingDistractors');
    expect(entry).not.toHaveProperty('correctAnswer');
    expect(entry).not.toHaveProperty('incorrectAnswers');
    expect(Object.keys(entry).sort()).toEqual([
      'matchingLeft',
      'matchingRight',
      'text',
    ]);
  });

  it('applies the identical permutation to English and to every locale (MC)', () => {
    const projected = toPublicQuestion(mc, mcTranslations);
    const english = ['Paris', 'London', 'Rome', 'Madrid'];
    const permutation = (projected.choices ?? []).map((c) =>
      english.indexOf(c)
    );
    expect(permutation.slice().sort()).toEqual([0, 1, 2, 3]);
    expect(projected.localized?.es.choices).toEqual(
      permutation.map((i) => (mcTranslations.es.choices ?? [])[i])
    );
    expect(projected.localized?.so.choices).toEqual(
      permutation.map((i) => (mcTranslations.so.choices ?? [])[i])
    );
  });

  it('merges translated pair-rights and distractors in the English merge order (Matching)', () => {
    const projected = toPublicQuestion(matching, {
      es: {
        text: 'Empareja',
        matchingRight: ['Mamífero', 'Anfibio'],
        matchingDistractors: ['Reptil', 'Pez'],
      },
    });
    const englishMerged = ['Mammal', 'Amphibian', 'Reptile', 'Fish'];
    const merged = ['Mamífero', 'Anfibio', 'Reptil', 'Pez'];
    const permutation = (projected.matchingRight ?? []).map((r) =>
      englishMerged.indexOf(r)
    );
    expect(projected.localized?.es.matchingRight).toEqual(
      permutation.map((i) => merged[i])
    );
  });

  it('applies the identical permutation for Ordering', () => {
    const items = ['Uno', 'Dos', 'Tres', 'Cuatro'];
    const projected = toPublicQuestion(ordering, {
      es: { text: 'Ordena', orderingItems: items },
    });
    const english = ['One', 'Two', 'Three', 'Four'];
    const permutation = (projected.orderingItems ?? []).map((o) =>
      english.indexOf(o)
    );
    expect(projected.localized?.es.orderingItems).toEqual(
      permutation.map((i) => items[i])
    );
  });

  it('omits a locale the caller filtered out for being unreviewed or stale', () => {
    const projected = toPublicQuestion(mc, { es: mcTranslations.es });
    expect(Object.keys(projected.localized ?? {})).toEqual(['es']);
  });

  it('drops a misaligned locale array rather than serving it', () => {
    const projected = toPublicQuestion(mc, {
      es: { text: 'x', choices: ['a', 'b'] },
    });
    expect(projected.localized?.es).toEqual({ text: 'x' });
  });

  it('keeps placeholder and rubric inside the free-response branch only', () => {
    const fr: QuizQuestion = {
      id: 'q-fr',
      timeLimit: 0,
      type: 'free-response',
      text: 'Explain.',
      correctAnswer: '',
      incorrectAnswers: [],
      placeholder: 'Cite evidence.',
    };
    expect(
      toPublicQuestion(fr, {
        es: { text: 'Explica.', placeholder: 'Cita evidencia.' },
      }).localized?.es
    ).toEqual({ text: 'Explica.', placeholder: 'Cita evidencia.' });
    expect(
      toPublicQuestion(mc, { es: { text: 't', placeholder: 'p' } }).localized
        ?.es
    ).toEqual({ text: 't' });
  });
});
