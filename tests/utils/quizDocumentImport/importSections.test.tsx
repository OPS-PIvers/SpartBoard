/** Printed headings become quiz sections (docs/plans/QUIZ_EXAMVIEW_IMPORT.md E16). */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  chooseCountOf,
  headingParts,
  unenforcedChooseNotes,
} from '@/utils/quizDocumentImport/importSections';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import { extractedToQuizData } from '@/utils/quizDocumentImport/toQuizData';
import { sessionSectionsFor } from '@/utils/quizSections';
import { QuizDocumentReview } from '@/components/widgets/QuizWidget/components/QuizDocumentReview';
import type { ExtractedQuiz } from '@/utils/quizDocumentImport/types';
import type { QuizData } from '@/types';

const read = (text: string): ExtractedQuiz => {
  const { questions, texts } = parseDocument(
    text.split('\n').map((line) => ({ text: line }))
  );
  return { title: 'Test', questions, images: [], texts, warnings: [] };
};

const TEST = `Multiple Choice
1. What is 2 + 2?
A. 3
B. 4
2. What is 3 + 3?
A. 6
B. 7
Short Answer - Pick two (3 points each)
3. Explain producers.
4. Explain consumers.
5. Explain decomposers.
Graphing
Use the data table below to answer.
6. Graph the data.`;

describe('heading text', () => {
  it('drops the points and keeps printed directions apart from the title', () => {
    expect(
      headingParts(
        'Short Answer-PICK TWO (2) QUESTIONS TO ANSWER-3 points each'
      )
    ).toEqual({
      title: 'Short Answer',
      directions: 'PICK TWO (2) QUESTIONS TO ANSWER',
    });
    expect(headingParts('Graphing Problem-5 points')).toEqual({
      title: 'Graphing Problem',
    });
    expect(headingParts('Section 2: Reading')).toEqual({
      title: 'Section 2: Reading',
    });
  });

  it.each([
    ['PICK TWO (2) QUESTIONS TO ANSWER', 2],
    ['Answer any 3 of the following.', 3],
    ['Choose two of the following', 2],
    ['Select one answer for each question.', undefined],
    ['Choose the best answer.', undefined],
    ['Answer all questions.', undefined],
  ])('reads a choose count from %j', (text, count) => {
    expect(chooseCountOf(text)).toBe(count);
  });
});

describe('extractedToQuizData with sections', () => {
  it('makes one section per heading, with the count and directions', () => {
    const quiz = extractedToQuizData(read(TEST), { sections: true });
    expect(quiz.sections?.map((s) => [s.title, s.chooseCount])).toEqual([
      ['Multiple Choice', undefined],
      ['Short Answer', 2],
      ['Graphing', undefined],
    ]);
    expect(quiz.sections?.[2].directions).toBe(
      'Use the data table below to answer.'
    );
    const frozen = sessionSectionsFor(quiz);
    expect(frozen.map((s) => s.questionIds.length)).toEqual([2, 3, 1]);
    // The section shows the directions, so the stem no longer repeats them.
    expect(quiz.questions[5].text).toBe('Graph the data.');
  });

  it('keeps the directions in the stem and adds no sections without the flag', () => {
    const extracted = read(TEST);
    const quiz = extractedToQuizData(extracted);
    expect(quiz.sections).toBeUndefined();
    expect(quiz.order).toBeUndefined();
    expect(quiz.questions[5].text).toBe(
      'Use the data table below to answer. Graph the data.'
    );
    expect(unenforcedChooseNotes(extracted.questions)).toEqual([
      'Question 3: Students choose 2 of these 3; turn on sections to enforce it.',
    ]);
  });

  it('makes no sections for a test that printed no headings', () => {
    const quiz = extractedToQuizData(
      read('1. One?\nA. a\nB. b\n2. Two?\nA. a\nB. b'),
      { sections: true }
    );
    expect(quiz.sections).toBeUndefined();
  });

  it('ignores a count that leaves no choice', () => {
    const quiz = extractedToQuizData(
      read('Short Answer - Answer any 2\n1. One.\n2. Two.'),
      { sections: true }
    );
    expect(quiz.sections?.[0].chooseCount).toBeUndefined();
  });
});

describe('review with sections', () => {
  it('shows each heading and drops a section whose questions are all unticked', () => {
    const data = extractedToQuizData(read(TEST), { sections: true });
    const onChange = vi.fn();
    render(<QuizDocumentReview data={data} onChange={onChange} />);
    expect(
      screen.getByText('Short Answer · Students answer 2 of these')
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Create question 6'));
    const latest = (): QuizData =>
      onChange.mock.calls[onChange.mock.calls.length - 1][0] as QuizData;
    expect(latest().sections?.map((s) => s.title)).toEqual([
      'Multiple Choice',
      'Short Answer',
    ]);
    // Ticked back on, it returns to its own section.
    fireEvent.click(screen.getByLabelText('Create question 6'));
    expect(sessionSectionsFor(latest()).at(-1)?.title).toBe('Graphing');
  });
});
