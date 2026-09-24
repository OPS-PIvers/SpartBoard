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
import type { ExtractedImage } from '@/utils/quizDocumentImport';
import { extractedToQuizData } from '@/utils/quizDocumentImport/toQuizData';

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

function picture(id: string): ExtractedImage {
  return {
    id,
    blob: new Blob(['png'], { type: 'image/png' }),
    contentType: 'image/png',
    name: `${id}.png`,
  };
}

/** Renders and hands back the latest emitted quiz. */
function setup(data: QuizData, images: ExtractedImage[] = []) {
  const onChange = vi.fn();
  const utils = render(
    <QuizDocumentReview data={data} onChange={onChange} images={images} />
  );
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

  it('shows the number the test printed beside the position', () => {
    setup(quiz([question(), question({ id: 'q2', sourceLabel: '2·3' })]));
    expect(screen.getByText('printed 2·3')).toBeTruthy();
    expect(screen.getAllByText(/^printed /)).toHaveLength(1);
  });

  it('keeps the quiz title the read produced', () => {
    const { latest } = setup(quiz([question(), question({ id: 'q2' })]));
    fireEvent.click(screen.getByLabelText('Create question 2'));
    expect(latest().title).toBe('Unit 3 Test');
  });
});

/**
 * Which questions use which picture (D14). The reader proposes the links and
 * is often wrong at the edges of a page, so a teacher who cannot move a
 * diagram off the wrong question would have to fix it in the editor later —
 * after it has already been uploaded.
 */
describe('QuizDocumentReview pictures', () => {
  it('says nothing about pictures when the document had none', () => {
    setup(quiz([question()]));
    expect(screen.queryByText('Pictures')).toBeNull();
  });

  it('shows the picture the reader put on a question', () => {
    setup(quiz([question({ stimulusIds: ['img-1'] })]), [picture('img-1')]);
    expect(screen.getByAltText('Picture 1 on question 1')).toBeTruthy();
  });

  it('takes a picture off the question the reader guessed wrong', () => {
    const { latest } = setup(quiz([question({ stimulusIds: ['img-1'] })]), [
      picture('img-1'),
    ]);
    fireEvent.click(screen.getByLabelText('Remove Picture 1 from question 1'));
    expect(latest().questions[0].stimulusIds).toEqual([]);
  });

  it('puts a picture on a second question, so one upload serves both', () => {
    const { latest } = setup(
      quiz([
        question({ stimulusIds: ['img-1'] }),
        question({ id: 'q2', stimulusIds: [] }),
      ]),
      [picture('img-1')]
    );

    fireEvent.change(screen.getByLabelText('Add a picture to question 2'), {
      target: { value: 'img-1' },
    });

    // The same reader id on both: `attachDocumentImages` uploads it once.
    expect(latest().questions[0].stimulusIds).toEqual(['img-1']);
    expect(latest().questions[1].stimulusIds).toEqual(['img-1']);
  });

  it('names the other questions a shared picture is on', () => {
    setup(
      quiz([
        question({ stimulusIds: ['img-1'] }),
        question({ id: 'q2', stimulusIds: ['img-1'] }),
      ]),
      [picture('img-1')]
    );
    // Told by name, not by a colour a teacher has to decode.
    expect(screen.getAllByText('Also on 2').length).toBe(1);
    expect(screen.getAllByText('Also on 1').length).toBe(1);
  });

  it('offers only the pictures the question does not already have', () => {
    setup(quiz([question({ stimulusIds: ['img-1'] })]), [
      picture('img-1'),
      picture('img-2'),
    ]);
    const options = screen
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', 'img-2']);
  });

  it('ignores a stimulus id the document did not carry', () => {
    // A quiz can reach this table with ids from elsewhere; there is no
    // thumbnail for those, and showing a broken image would be worse.
    setup(quiz([question({ stimulusIds: ['not-from-this-read'] })]), [
      picture('img-1'),
    ]);
    expect(screen.queryByAltText(/on question 1/)).toBeNull();
  });
});

describe('QuizDocumentReview spill warnings and filter (R18, R19)', () => {
  it('marks a choice that swallowed another one, in words', () => {
    setup(
      quiz([
        question({
          correctAnswer: '',
          needsKey: true,
          incorrectAnswers: ['357.4 d. 35,740', '3,574', '35.74'],
        }),
      ])
    );
    expect(screen.getByText('Check text')).toBeTruthy();
    expect(
      screen.getByText('This choice may contain another choice')
    ).toBeTruthy();
  });

  it('filters to flagged rows', () => {
    setup(
      quiz([
        question({ id: 'clean', text: 'Clean question' }),
        question({
          id: 'spill',
          text: 'Spilled question',
          incorrectAnswers: ['Green 1. B 2. C', 'Red'],
        }),
      ])
    );
    expect(screen.getByText('Clean question')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Show only flagged rows \(1\)/));
    expect(screen.queryByDisplayValue('Clean question')).toBeNull();
    expect(screen.getByDisplayValue('Spilled question')).toBeTruthy();
  });

  it('offers no filter when nothing is flagged', () => {
    setup(quiz([question()]));
    expect(screen.queryByText(/Show only flagged rows/)).toBeNull();
  });
});

describe('QuizDocumentReview — rows from the reliable reader (R9, R25)', () => {
  it('shows a survey item unticked and lets the teacher tick it back on', () => {
    const data = extractedToQuizData({
      title: 'Test',
      images: [],
      warnings: [],
      questions: [
        {
          number: 1,
          text: 'Graded?',
          type: 'MC',
          options: [
            { letter: 'A', text: 'x' },
            { letter: 'B', text: 'y' },
          ],
          correctAnswer: 'x',
          imageIds: [],
          warnings: [],
        },
        {
          number: 2,
          text: 'How confident are you?',
          type: 'free-response',
          options: [],
          correctAnswer: '',
          imageIds: [],
          warnings: [],
          suggestUntick: 'This looks like a self-reflection item.',
        },
      ],
    });
    const { latest } = setup(data);
    const box = screen.getByLabelText('Create question 2');
    expect(box.checked).toBe(false);
    expect(
      screen.getByText(/This looks like a self-reflection item/)
    ).toBeInTheDocument();
    fireEvent.click(box);
    expect(latest().questions.map((q) => q.text)).toEqual([
      'Graded?',
      'How confident are you?',
    ]);
  });

  it('names the shared passage a row uses and where else it is used', () => {
    const data: QuizData = {
      ...quiz([
        question({ id: 'a', stimulusIds: ['p1'] }),
        question({ id: 'b', stimulusIds: ['p1'] }),
      ]),
      stimuli: [
        { id: 'p1', type: 'text', url: '', text: 'Story', label: 'Passage 1' },
      ],
    };
    setup(data);
    expect(
      screen.getByText('Uses Passage 1, shared with 2')
    ).toBeInTheDocument();
  });
});
