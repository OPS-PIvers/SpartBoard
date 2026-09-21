/**
 * The review table a teacher sees before a read test document becomes a quiz
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D10). Nothing here is cosmetic: what it
 * emits is exactly what gets created.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuizDocumentReview } from '@/components/widgets/QuizWidget/components/QuizDocumentReview';
import type { QuizData, QuizQuestion } from '@/types';

function question(over: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id: 'q1',
    text: 'What colour is the sky?',
    timeLimit: 0,
    type: 'MC',
    correctAnswer: 'Blue',
    incorrectAnswers: ['Green', 'Red'],
    ...over,
  };
}

function quiz(questions: QuizQuestion[]): QuizData {
  return {
    id: 'quiz-1',
    title: 'Unit 3 Test',
    questions,
    createdAt: 1,
    updatedAt: 1,
  };
}

/** Renders and hands back the latest emitted quiz. */
function setup(data: QuizData) {
  const onChange = vi.fn();
  const utils = render(<QuizDocumentReview data={data} onChange={onChange} />);
  const latest = (): QuizData =>
    onChange.mock.calls[onChange.mock.calls.length - 1][0] as QuizData;
  return { ...utils, onChange, latest };
}

describe('QuizDocumentReview', () => {
  it('explains what to do when nothing could be read', () => {
    setup(quiz([]));
    expect(
      screen.getByText(/No questions could be read from this document/i)
    ).toBeTruthy();
  });

  it('counts what will be created and what still needs an answer', () => {
    setup(
      quiz([
        question(),
        question({
          id: 'q2',
          text: 'Name the capital.',
          correctAnswer: '',
          incorrectAnswers: ['Paris', 'Rome'],
          needsKey: true,
        }),
      ])
    );
    expect(screen.getByText(/2 of 2 questions will be created/i)).toBeTruthy();
    expect(screen.getByText(/1 still needs an answer/i)).toBeTruthy();
  });

  it('drops an unticked question from what gets created, and puts it back', () => {
    const { latest } = setup(quiz([question(), question({ id: 'q2' })]));

    fireEvent.click(screen.getByLabelText('Create question 2'));
    expect(latest().questions.map((q) => q.id)).toEqual(['q1']);
    expect(screen.getByText(/1 of 2 questions will be created/i)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Create question 2'));
    expect(latest().questions.map((q) => q.id)).toEqual(['q1', 'q2']);
  });

  it('carries a corrected stem through to what gets created', () => {
    const { latest } = setup(quiz([question()]));
    fireEvent.change(screen.getByLabelText('Question 1 text'), {
      target: { value: 'What colour is the sea?' },
    });
    expect(latest().questions[0].text).toBe('What colour is the sea?');
    // The textarea has to show the edit, or the teacher cannot keep typing.
    expect(
      screen.getByLabelText<HTMLTextAreaElement>('Question 1 text').value
    ).toBe('What colour is the sea?');
  });

  it('clears "Needs answer" when the teacher picks one of the choices', () => {
    const { latest } = setup(
      quiz([
        question({
          correctAnswer: '',
          incorrectAnswers: ['Paris', 'Rome'],
          needsKey: true,
        }),
      ])
    );
    expect(screen.getByText('Needs answer')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Question 1, answer: Paris'));

    const [q] = latest().questions;
    expect(q.correctAnswer).toBe('Paris');
    expect(q.incorrectAnswers).toEqual(['Rome']);
    expect(q.needsKey).toBe(false);
    expect(screen.queryByText('Needs answer')).toBeNull();
  });

  it('keeps the choices in the same order after the answer changes', () => {
    setup(quiz([question()]));
    const order = () =>
      screen
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label') ?? '');
    const before = order();

    fireEvent.click(screen.getByLabelText('Question 1, answer: Red'));

    // Re-deriving the list answer-first would shuffle it under the cursor.
    expect(order()).toEqual(before);
  });

  it('offers no answer picker for a written response', () => {
    setup(
      quiz([
        question({
          type: 'free-response',
          correctAnswer: '',
          incorrectAnswers: [],
        }),
      ])
    );
    expect(screen.getByText('Written response')).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText('Needs answer')).toBeNull();
  });

  it('keeps the quiz title the read produced', () => {
    const { latest } = setup(quiz([question(), question({ id: 'q2' })]));
    fireEvent.click(screen.getByLabelText('Create question 2'));
    expect(latest().title).toBe('Unit 3 Test');
  });
});
