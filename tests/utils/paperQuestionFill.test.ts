/**
 * Filling a read document onto the rows of a paper stub (D17).
 *
 * A stub row already exists and may already hold a teacher's own work, so a
 * fill that overreaches is worse than one that does nothing: it can turn a
 * question the teacher wrote into whatever the reader made of a blurry scan.
 */
import { describe, it, expect } from 'vitest';
import { applyQuestionFill } from '@/utils/paperQuestionOcr';
import type { QuizData, QuizQuestion } from '@/types';

function stub(over: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id: 'q1',
    text: 'Question 1',
    timeLimit: 0,
    type: 'MC',
    correctAnswer: '',
    incorrectAnswers: ['', '', ''],
    needsKey: true,
    ...over,
  };
}

const quiz = (questions: QuizQuestion[]): QuizData => ({
  id: 'quiz-1',
  title: 'Unit 3 Test',
  questions,
  createdAt: 1,
  updatedAt: 1,
});

describe('applyQuestionFill', () => {
  it('fills the stem, the choices and the key onto a stub row', () => {
    const next = applyQuestionFill(
      quiz([stub()]),
      {
        1: {
          text: 'Which planet is closest to the sun?',
          options: ['Mercury', 'Venus', 'Mars'],
          correctAnswer: 'Mercury',
        },
      },
      99
    );
    const q = next.questions[0];
    expect(q.text).toBe('Which planet is closest to the sun?');
    expect(q.correctAnswer).toBe('Mercury');
    expect(q.incorrectAnswers).toEqual(['Venus', 'Mars']);
    expect(next.updatedAt).toBe(99);
  });

  it('lets the option count follow the document', () => {
    // The stub was built with four blanks; the paper has three choices.
    const next = applyQuestionFill(
      quiz([stub()]),
      {
        1: {
          text: 'Pick one',
          options: ['A one', 'B two', 'C three'],
          correctAnswer: 'B two',
        },
      },
      99
    );
    expect(next.questions[0].incorrectAnswers).toEqual(['A one', 'C three']);
  });

  it('clears the key a teacher owed once the document supplies one', () => {
    const next = applyQuestionFill(
      quiz([stub()]),
      { 1: { text: 'Pick one', options: ['Yes', 'No'], correctAnswer: 'Yes' } },
      99
    );
    expect(next.questions[0].needsKey).toBeUndefined();
  });

  it('leaves the key owed when the document listed choices but no answer', () => {
    const next = applyQuestionFill(
      quiz([stub()]),
      { 1: { text: 'Pick one', options: ['Yes', 'No'], correctAnswer: '' } },
      99
    );
    expect(next.questions[0].needsKey).toBe(true);
    expect(next.questions[0].correctAnswer).toBe('');
  });

  it('keeps the row a stub when the document had no choices for it', () => {
    // A misread option list is likelier than a question that was written
    // response all along, so the type the stub was built with stands.
    const next = applyQuestionFill(
      quiz([stub()]),
      { 1: { text: 'Name the largest planet' } },
      99
    );
    expect(next.questions[0].type).toBe('MC');
    expect(next.questions[0].text).toBe('Name the largest planet');
  });

  it('leaves a row the document said nothing about alone', () => {
    const original = quiz([stub(), stub({ id: 'q2', text: 'My own wording' })]);
    const next = applyQuestionFill(original, { 1: { text: 'Filled' } }, 99);
    expect(next.questions[1]).toBe(original.questions[1]);
  });

  it('ignores an empty stem rather than blanking the row', () => {
    const original = quiz([stub({ text: 'My own wording' })]);
    expect(applyQuestionFill(original, { 1: { text: '  ' } }, 99)).toBe(
      original
    );
  });

  it('is the same quiz when nothing actually changes', () => {
    // Saving an unchanged quiz would bump `updatedAt` and churn Drive.
    const original = quiz([
      stub({
        text: 'Pick one',
        correctAnswer: 'Yes',
        incorrectAnswers: ['No'],
        needsKey: undefined,
      }),
    ]);
    expect(
      applyQuestionFill(
        original,
        {
          1: { text: 'Pick one', options: ['Yes', 'No'], correctAnswer: 'Yes' },
        },
        99
      )
    ).toBe(original);
  });
});
