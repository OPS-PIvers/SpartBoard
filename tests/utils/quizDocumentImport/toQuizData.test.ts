import { describe, it, expect } from 'vitest';
import {
  extractedToQuizData,
  rowWarnings,
} from '@/utils/quizDocumentImport/toQuizData';
import type {
  ExtractedQuestion,
  ExtractedQuiz,
} from '@/utils/quizDocumentImport/types';

function question(over: Partial<ExtractedQuestion> = {}): ExtractedQuestion {
  return {
    number: 1,
    text: 'What colour is the sky?',
    type: 'MC',
    options: [
      { letter: 'A', text: 'Blue' },
      { letter: 'B', text: 'Green' },
    ],
    correctAnswer: 'Blue',
    imageIds: [],
    warnings: [],
    ...over,
  };
}

function quiz(over: Partial<ExtractedQuiz> = {}): ExtractedQuiz {
  return {
    title: 'Unit 3 Test',
    questions: [question()],
    images: [],
    warnings: [],
    ...over,
  };
}

describe('extractedToQuizData', () => {
  it('keeps the answer and makes the rest distractors', () => {
    const data = extractedToQuizData(quiz());
    expect(data.questions[0].correctAnswer).toBe('Blue');
    expect(data.questions[0].incorrectAnswers).toEqual(['Green']);
    expect(data.questions[0].needsKey).toBeUndefined();
  });

  it('flags a question the document gave no answer for, keeping every option', () => {
    const data = extractedToQuizData(
      quiz({ questions: [question({ correctAnswer: '' })] })
    );
    const [q] = data.questions;
    expect(q.needsKey).toBe(true);
    expect(q.correctAnswer).toBe('');
    // Nothing is dropped — the teacher picks one in the review table.
    expect(q.incorrectAnswers).toEqual(['Blue', 'Green']);
  });

  it('leaves a written-response question unanswered and unflagged', () => {
    const data = extractedToQuizData(
      quiz({
        questions: [
          question({ type: 'free-response', options: [], correctAnswer: '' }),
        ],
      })
    );
    const [q] = data.questions;
    expect(q.correctAnswer).toBe('');
    expect(q.incorrectAnswers).toEqual([]);
    expect(q.needsKey).toBeUndefined();
  });

  it('names the quiz after the document, and falls back when that is blank', () => {
    expect(extractedToQuizData(quiz()).title).toBe('Unit 3 Test');
    expect(extractedToQuizData(quiz({ title: '   ' })).title).toBe(
      'Imported Quiz'
    );
  });

  it('prefers an explicit title over the document name', () => {
    expect(extractedToQuizData(quiz(), { title: 'Chapter 4' }).title).toBe(
      'Chapter 4'
    );
  });

  it('gives every question its own id', () => {
    const data = extractedToQuizData(
      quiz({ questions: [question(), question({ number: 2 })] })
    );
    expect(data.questions[0].id).not.toBe(data.questions[1].id);
  });
});

describe('rowWarnings', () => {
  it('numbers each note so it lines up with its review row', () => {
    expect(
      rowWarnings(
        quiz({
          questions: [
            question({ number: 4, warnings: ['couldn’t read this type'] }),
            question({ number: 7, warnings: ['two answers were marked'] }),
          ],
        })
      )
    ).toEqual([
      'Question 4: couldn’t read this type',
      'Question 7: two answers were marked',
    ]);
  });

  it('is empty when nothing needs saying', () => {
    expect(rowWarnings(quiz())).toEqual([]);
  });
});
