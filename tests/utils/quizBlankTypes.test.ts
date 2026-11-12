import { describe, it, expect } from 'vitest';
import type { QuizQuestion } from '@/types';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import {
  FIB_BLANK_SEP,
  joinBlanks,
  scoreFibBlanks,
} from '@/utils/quizFibBlanks';
import {
  blankTypeOf,
  blankTypeProblem,
  blankTypeUpdate,
  dropdownChoices,
  publicBlankFields,
  spokenBlankChoices,
  wordBankWords,
} from '@/utils/quizBlankTypes';
import { quizIncompleteReason } from '@/utils/activityCompleteness';

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const fib = (extra: Partial<QuizQuestion>): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'Ice ___ when it is ___.',
  type: 'FIB',
  correctAnswer: joinBlanks(['melts', 'heated']),
  incorrectAnswers: [],
  ...extra,
});

const KEY_FIELDS = [
  'correctAnswer',
  'alternateAnswers',
  'blankAlternates',
  'incorrectAnswers',
];

describe('blankTypeOf', () => {
  it('is typed unless a FIB question says dropdown or drag', () => {
    expect(blankTypeOf(fib({}))).toBe('typed');
    expect(blankTypeOf(fib({ blankType: 'dropdown' }))).toBe('dropdown');
    expect(blankTypeOf(fib({ blankType: 'drag' }))).toBe('drag');
    expect(blankTypeOf({ type: 'MC', blankType: 'drag' })).toBe('typed');
  });
});

describe('public question shape', () => {
  it('sends dropdown choices in authored order and never the key', () => {
    const pub = toPublicQuestion(
      fib({
        blankType: 'dropdown',
        blankAlternates: [{ answers: ['thaws'] }, { answers: [] }],
        blankChoices: [
          { choices: ['freezes', 'melts', 'Melts', ''] },
          { choices: ['heated', 'cooled'] },
        ],
      })
    );
    expect(pub.blankType).toBe('dropdown');
    expect(pub.blankCount).toBe(2);
    expect(pub.blankChoices).toEqual([
      { choices: ['freezes', 'melts'] },
      { choices: ['heated', 'cooled'] },
    ]);
    for (const field of KEY_FIELDS) expect(pub).not.toHaveProperty(field);
    expect(JSON.stringify(pub)).not.toContain('thaws');
  });

  it('sends the drag word bank shuffled, with every word kept', () => {
    const pub = toPublicQuestion(
      fib({
        correctAnswer: joinBlanks(['heat', 'heat']),
        blankType: 'drag',
        wordBank: ['heat', 'heat', 'light', ' '],
      })
    );
    expect(pub.blankType).toBe('drag');
    expect([...(pub.wordBank ?? [])].sort()).toEqual(['heat', 'heat', 'light']);
    expect(pub).not.toHaveProperty('wordBankReuse');
    for (const field of KEY_FIELDS) expect(pub).not.toHaveProperty(field);
  });

  it('lists a reusable word once and says it can be reused', () => {
    const fields = publicBlankFields(
      fib({
        blankType: 'drag',
        wordBankReuse: true,
        wordBank: ['heat', 'Heat', 'light'],
      }),
      (items) => [...items]
    );
    expect(fields).toEqual({
      blankType: 'drag',
      wordBank: ['heat', 'light'],
      wordBankReuse: true,
    });
  });

  it('leaves a typed question exactly as before', () => {
    const typed = fib({});
    const pub = toPublicQuestion(typed);
    expect(pub).toEqual({
      id: 'q1',
      type: 'FIB',
      text: 'Ice ___ when it is ___.',
      timeLimit: 0,
      blankCount: 2,
    });
    const single = toPublicQuestion(
      fib({ text: 'Water boils at ___', correctAnswer: '100' })
    );
    expect(Object.keys(single).sort()).toEqual([
      'id',
      'text',
      'timeLimit',
      'type',
    ]);
  });

  it('falls back to typed boxes when a list is unusable', () => {
    expect(
      publicBlankFields(
        fib({ blankType: 'dropdown', blankChoices: [{ choices: ['a'] }] })
      )
    ).toEqual({});
    expect(publicBlankFields(fib({ blankType: 'drag', wordBank: [] }))).toEqual(
      {}
    );
  });

  it('strips the blank separator from any word', () => {
    expect(
      dropdownChoices(
        fib({
          correctAnswer: 'a',
          blankChoices: [{ choices: [`a${FIB_BLANK_SEP}b`, 'c'] }],
        })
      )
    ).toEqual([['ab', 'c']]);
    expect(wordBankWords(fib({ wordBank: [`x${FIB_BLANK_SEP}`] }))).toEqual([
      'x',
    ]);
  });
});

describe('grading is unchanged', () => {
  it('grades a dropdown or drag answer like a typed one', () => {
    const q = fib({
      blankType: 'dropdown',
      blankChoices: [
        { choices: ['freezes', 'melts'] },
        { choices: ['heated', 'cooled'] },
      ],
    });
    expect(
      scoreFibBlanks(q, joinBlanks(['melts', 'cooled']), normalize)
    ).toEqual({ correct: 1, total: 2 });
    expect(
      scoreFibBlanks(q, joinBlanks(['Melts', 'heated']), normalize)
    ).toEqual({ correct: 2, total: 2 });
  });

  it('lets a drag blank accept another bank word through also-accept (M9)', () => {
    const q = fib({
      correctAnswer: joinBlanks(['heat', 'light']),
      blankAlternates: [{ answers: ['light'] }, { answers: ['heat'] }],
      blankType: 'drag',
      wordBank: ['heat', 'light'],
    });
    expect(scoreFibBlanks(q, joinBlanks(['light', 'heat']), normalize)).toEqual(
      { correct: 2, total: 2 }
    );
  });
});

describe('blankTypeProblem', () => {
  it('needs every dropdown answer among its choices', () => {
    expect(
      blankTypeProblem(
        fib({
          blankType: 'dropdown',
          blankChoices: [
            { choices: ['freezes', 'melts'] },
            { choices: ['cooled', 'chilled'] },
          ],
        })
      )
    ).toBe('pick the right choice for blank 2');
    expect(
      blankTypeProblem(
        fib({
          blankType: 'dropdown',
          blankChoices: [{ choices: ['melts'] }, { choices: ['heated', 'x'] }],
        })
      )
    ).toBe('give blank 1 at least two choices');
  });

  it('warns about choices that differ only by case, since students see one', () => {
    expect(
      blankTypeProblem(
        fib({
          correctAnswer: 'melts',
          text: 'Ice ___.',
          blankType: 'dropdown',
          blankChoices: [{ choices: ['melts', 'Melts', 'freezes'] }],
        })
      )
    ).toBe('remove the repeated choice in the blank');
  });

  it('needs every drag answer in the bank, twice when a word cannot be reused', () => {
    const q = fib({
      correctAnswer: joinBlanks(['heat', 'heat']),
      blankType: 'drag',
      wordBank: ['heat', 'light'],
    });
    expect(blankTypeProblem(q)).toBe("add blank 1's answer to the word bank");
    expect(blankTypeProblem({ ...q, wordBankReuse: true })).toBeNull();
    expect(
      blankTypeProblem({ ...q, wordBank: ['heat', 'heat', 'light'] })
    ).toBeNull();
  });

  it('is clear for typed questions', () => {
    expect(blankTypeProblem(fib({}))).toBeNull();
  });

  it('shows up in the editor notice', () => {
    expect(
      quizIncompleteReason({
        title: 'T',
        questions: [
          fib({
            blankType: 'dropdown',
            blankChoices: [{ choices: ['a', 'b'] }, { choices: ['c', 'd'] }],
          }),
        ],
      })
    ).toBe('Question 1: pick the right choice for blank 1');
  });
});

describe('blankTypeUpdate', () => {
  it('seeds dropdown choices and the word bank from the answers', () => {
    const lists = blankTypeUpdate(fib({}), 'dropdown').blankChoices ?? [];
    expect(lists.map((l) => l.choices.length)).toEqual([3, 3]);
    expect(lists.map((l) => l.choices.filter(Boolean))).toEqual([
      ['melts'],
      ['heated'],
    ]);
    expect(blankTypeUpdate(fib({}), 'drag').wordBank).toEqual([
      'melts',
      'heated',
      '',
    ]);
  });

  it('seeds the dropdown answer in a random slot', () => {
    const slots = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const [first] = blankTypeUpdate(fib({}), 'dropdown').blankChoices ?? [];
      slots.add(first.choices.indexOf('melts'));
    }
    expect(slots.size).toBeGreaterThan(1);
  });

  it('keeps the key and clears the lists when going back to typed', () => {
    const update = blankTypeUpdate(
      fib({ blankType: 'drag', wordBank: ['a'] }),
      'typed'
    );
    expect(update).not.toHaveProperty('correctAnswer');
    expect(update.blankType).toBeUndefined();
    expect(update.wordBank).toBeUndefined();
  });
});

describe('spokenBlankChoices', () => {
  it('reads each dropdown choice once, or the word bank', () => {
    expect(
      spokenBlankChoices({
        type: 'FIB',
        blankType: 'dropdown',
        blankChoices: [{ choices: ['a', 'b'] }, { choices: ['b', 'c'] }],
      })
    ).toEqual(['a', 'b', 'c']);
    expect(
      spokenBlankChoices({ type: 'FIB', blankType: 'drag', wordBank: ['x'] })
    ).toEqual(['x']);
    expect(spokenBlankChoices({ type: 'FIB' })).toEqual([]);
  });
});
