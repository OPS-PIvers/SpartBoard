/**
 * THE GATE (plan §11 PR1). For MC, Matching and Ordering, with
 * `hiddenOptionIdsByQuestion` AND the seeded shuffle active, the English string
 * written for a locale-L selection equals a monolingual student's for the same
 * displayed option. Exercises the real chain: toPublicQuestion →
 * applyHiddenOptions → shuffleQuestionForStudent → toDisplayAnswer →
 * toCanonicalAnswer.
 */
import { describe, it, expect } from 'vitest';
import type {
  QuestionTranslation,
  QuizPublicQuestion,
  QuizQuestion,
} from '@/types';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import { applyHiddenOptions } from '@/utils/quizOverrideServing';
import { shuffleQuestionForStudent } from '@/utils/quizShuffle';
import {
  toCanonicalAnswer,
  toDisplayAnswer,
} from '@/utils/quizLocalizedAnswer';

const SEED = 'uid-student-42:attempt-0';
const LOCALE = 'es';

const mc: QuizQuestion = {
  id: 'q-mc',
  timeLimit: 0,
  type: 'MC',
  text: 'Capital of France?',
  correctAnswer: 'Paris',
  incorrectAnswers: ['London', 'Rome', 'Madrid'],
};
const matching: QuizQuestion = {
  id: 'q-match',
  timeLimit: 0,
  type: 'Matching',
  text: 'Match',
  correctAnswer: 'Dog:Mammal|Frog:Amphibian',
  incorrectAnswers: [],
  matchingDistractors: ['Reptile', 'Fish'],
};
const ordering: QuizQuestion = {
  id: 'q-order',
  timeLimit: 0,
  type: 'Ordering',
  text: 'Order',
  correctAnswer: 'One|Two|Three|Four',
  incorrectAnswers: [],
};

const translations: Record<string, Record<string, QuestionTranslation>> = {
  'q-mc': {
    [LOCALE]: {
      text: '¿Capital de Francia?',
      choices: ['París', 'Londres', 'Roma', 'Madrid-es'],
    },
  },
  'q-match': {
    [LOCALE]: {
      text: 'Empareja',
      matchingLeft: ['Perro', 'Rana'],
      matchingRight: ['Mamífero', 'Anfibio'],
      matchingDistractors: ['Reptil', 'Pez'],
    },
  },
  'q-order': {
    [LOCALE]: {
      text: 'Ordena',
      orderingItems: ['Uno', 'Dos', 'Tres', 'Cuatro'],
    },
  },
};

/** The client transform chain QuizStudentApp runs over one published question. */
const forStudent = (
  published: QuizPublicQuestion,
  hidden: Record<string, string[]> | undefined
): QuizPublicQuestion =>
  shuffleQuestionForStudent(applyHiddenOptions(published, hidden), SEED);

/** The field the student picks from, per type. */
const pickField = (q: QuizPublicQuestion) =>
  q.type === 'MC'
    ? 'choices'
    : q.type === 'Ordering'
      ? 'orderingItems'
      : 'matchingRight';

const cases: [string, QuizQuestion, Record<string, string[]> | undefined][] = [
  ['MC with a hidden option', mc, { 'q-mc': ['Rome'] }],
  ['Matching', matching, undefined],
  ['Ordering', ordering, undefined],
];

describe('the English answer a locale student writes', () => {
  it.each(cases)(
    '%s: equals what a monolingual student writes for the same displayed option',
    (_name, question, hidden) => {
      // ONE publish, two students on the same session doc — exactly production.
      const published = toPublicQuestion(question, translations[question.id]);
      const served = forStudent(published, hidden);
      const field = pickField(served);
      const english = served[field] ?? [];
      const labels = served.localized?.[LOCALE][field] ?? [];

      // What each component emits when the student picks slot `i`, in the space
      // that student is reading: MC a bare value, Ordering a '|' sequence,
      // Matching `term:def` pairs built from matchingLeft + the picked option.
      const emit = (values: string[], leftTerms: string[], i: number) => {
        if (served.type === 'MC') return values[i];
        if (served.type === 'Ordering') return values.join('|');
        return leftTerms.map((t) => `${t}:${values[i]}`).join('|');
      };
      const englishLeft = served.matchingLeft ?? [];
      const localeLeft = served.localized?.[LOCALE].matchingLeft ?? [];

      english.forEach((_en, i) => {
        const writtenByMonolingual = emit(english, englishLeft, i);
        // The Spanish student picks the same slot, reads a Spanish label, and
        // the boundary converts it back before anything reaches Firestore.
        const writtenByTranslated = toCanonicalAnswer(
          served,
          LOCALE,
          emit(labels, localeLeft, i)
        );
        expect(writtenByTranslated).toBe(writtenByMonolingual);
      });
      expect(labels.join('|')).not.toEqual(english.join('|'));
    }
  );

  it.each(cases)(
    '%s: every label stays index-aligned with its English string after both transforms',
    (_name, question, hidden) => {
      const served = forStudent(
        toPublicQuestion(question, translations[question.id]),
        hidden
      );
      const field = pickField(served);
      const english = served[field] ?? [];
      const labels = served.localized?.[LOCALE][field] ?? [];
      expect(labels).toHaveLength(english.length);

      // The English<->Spanish pairing is fixed by the source arrays and must
      // survive both the hidden-option filter and the per-student shuffle.
      const source = toPublicQuestion(question, translations[question.id]);
      const pairing = new Map(
        (source[field] ?? []).map((en, i) => [
          en,
          (source.localized?.[LOCALE][field] ?? [])[i],
        ])
      );
      english.forEach((en, i) => expect(labels[i]).toBe(pairing.get(en)));
    }
  );

  it('hides the same option in English and in the locale', () => {
    const served = forStudent(toPublicQuestion(mc, translations['q-mc']), {
      'q-mc': ['Rome'],
    });
    expect(served.choices).not.toContain('Rome');
    expect(served.localized?.[LOCALE].choices).not.toContain('Roma');
    expect(served.choices).toHaveLength(3);
    expect(served.localized?.[LOCALE].choices).toHaveLength(3);
  });

  it('round-trips a selection at every displayed index', () => {
    const served = forStudent(toPublicQuestion(mc, translations['q-mc']), {
      'q-mc': ['Rome'],
    });
    (served.choices ?? []).forEach((english) => {
      const shown = toDisplayAnswer(served, LOCALE, english);
      expect(toCanonicalAnswer(served, LOCALE, shown)).toBe(english);
    });
  });
});
