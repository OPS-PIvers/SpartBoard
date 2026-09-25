import { describe, expect, it } from 'vitest';
import type { QuizQuestion } from '@/types';
import {
  canAddRow,
  questionFromRows,
  rowsFromQuestion,
} from './quizChoiceRows';

const q = (over: Partial<QuizQuestion>): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 't',
  type: 'MC',
  correctAnswer: '',
  incorrectAnswers: [],
  ...over,
});

describe('quizChoiceRows', () => {
  it('reads a saved MC question with the answer first when no order is stored', () => {
    expect(
      rowsFromQuestion(
        q({ correctAnswer: 'Mercury', incorrectAnswers: ['Venus', 'Mars'] })
      )
    ).toEqual([
      { text: 'Mercury', correct: true },
      { text: 'Venus', correct: false },
      { text: 'Mars', correct: false },
    ]);
  });

  it('writes the same stored shape the old editor did and keeps the typed order', () => {
    const rows = [
      { text: 'Venus', correct: false },
      { text: 'Earth', correct: false },
      { text: 'Mercury', correct: true },
      { text: 'Mars', correct: false },
    ];
    const out = questionFromRows(rows, false);
    expect(out).toEqual({
      type: 'MC',
      correctAnswer: 'Mercury',
      incorrectAnswers: ['Venus', 'Earth', 'Mars'],
      optionOrder: [1, 2, 0, 3],
    });
    expect(rowsFromQuestion(q(out))).toEqual(rows);
  });

  it('omits the order when it matches the stored order', () => {
    const out = questionFromRows(
      [
        { text: 'A', correct: true },
        { text: 'B', correct: false },
      ],
      false
    );
    expect(out.optionOrder).toBeUndefined();
  });

  it('round-trips choose-all with right options anywhere and strips pipes', () => {
    const rows = [
      { text: '2', correct: true },
      { text: '4', correct: false },
      { text: '3|', correct: true },
      { text: '9', correct: false },
    ];
    const out = questionFromRows(rows, true);
    expect(out).toMatchObject({
      type: 'MA',
      correctAnswer: '2|3',
      incorrectAnswers: ['4', '9'],
    });
    expect(rowsFromQuestion(q(out)).map((r) => r.text)).toEqual([
      '2',
      '4',
      '3',
      '9',
    ]);
  });

  it('shows an imported question with no key as unmarked options in import order', () => {
    expect(
      rowsFromQuestion(q({ needsKey: true, incorrectAnswers: ['A', 'B', 'C'] }))
    ).toEqual([
      { text: 'A', correct: false },
      { text: 'B', correct: false },
      { text: 'C', correct: false },
    ]);
  });

  it('ignores an order that no longer fits the options', () => {
    expect(
      rowsFromQuestion(
        q({
          correctAnswer: 'A',
          incorrectAnswers: ['B', 'C'],
          optionOrder: [1, 0],
        })
      ).map((r) => r.text)
    ).toEqual(['A', 'B', 'C']);
  });

  it('leaves a blank right option out of the stored order', () => {
    const rows = [
      { text: 'B', correct: false },
      { text: '', correct: true },
      { text: 'A', correct: true },
    ];
    const out = questionFromRows(rows, true);
    expect(out.correctAnswer).toBe('|A');
    expect(rowsFromQuestion(q(out)).map((r) => r.text)).toEqual(['B', 'A']);
  });

  it('caps single-answer questions at five options', () => {
    const five = Array.from({ length: 5 }, () => ({
      text: 'x',
      correct: false,
    }));
    expect(canAddRow(five, false)).toBe(false);
    expect(canAddRow(five, true)).toBe(true);
  });
});
