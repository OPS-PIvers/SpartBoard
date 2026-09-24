import { describe, it, expect } from 'vitest';
import {
  extractedToQuizData,
  reviewExtrasFor,
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

  it('carries the reader image ids so save can swap them for stimuli', () => {
    const data = extractedToQuizData(
      quiz({ questions: [question({ imageIds: ['img-1', 'img-2'] })] })
    );
    expect(data.questions[0].stimulusIds).toEqual(['img-1', 'img-2']);
  });

  it('leaves stimulusIds off a question with no picture', () => {
    expect(
      extractedToQuizData(quiz()).questions[0].stimulusIds
    ).toBeUndefined();
  });

  it('gives every question its own id', () => {
    const data = extractedToQuizData(
      quiz({ questions: [question(), question({ number: 2 })] })
    );
    expect(data.questions[0].id).not.toBe(data.questions[1].id);
  });
});

describe('extractedToQuizData — choose all that apply', () => {
  it('keeps every right option and makes the rest distractors', () => {
    const data = extractedToQuizData(
      quiz({
        questions: [
          question({
            type: 'MA',
            options: [
              { letter: 'A', text: 'Blue' },
              { letter: 'B', text: 'Green' },
              { letter: 'C', text: 'Grey' },
            ],
            correctAnswer: 'Blue|Grey',
          }),
        ],
      })
    );
    expect(data.questions[0].type).toBe('MA');
    expect(data.questions[0].correctAnswer).toBe('Blue|Grey');
    expect(data.questions[0].incorrectAnswers).toEqual(['Green']);
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

describe('extractedToQuizData — reliability fields (R9, R23, R25)', () => {
  it('carries the printed label and points', () => {
    const data = extractedToQuizData(
      quiz({ questions: [question({ sourceLabel: '2·3', points: 2 })] })
    );
    expect(data.questions[0].sourceLabel).toBe('2·3');
    expect(data.questions[0].points).toBe(2);
  });

  it('keeps a keyed ordering item as Ordering', () => {
    const data = extractedToQuizData(
      quiz({
        questions: [
          question({
            type: 'Ordering',
            options: [
              { letter: 'A', text: 'second' },
              { letter: 'B', text: 'first' },
            ],
            correctAnswer: 'first|second',
          }),
        ],
      })
    );
    expect(data.questions[0].type).toBe('Ordering');
    expect(data.questions[0].correctAnswer).toBe('first|second');
    expect(data.questions[0].needsKey).toBeUndefined();
  });

  it('lists an unkeyed ordering item as a written question and says so', () => {
    const extracted = quiz({
      questions: [
        question({
          text: 'Put them in order.',
          type: 'Ordering',
          options: [
            { letter: 'A', text: 'second' },
            { letter: 'B', text: 'first' },
          ],
          correctAnswer: '',
        }),
      ],
    });
    const data = extractedToQuizData(extracted);
    expect(data.questions[0].type).toBe('free-response');
    expect(data.questions[0].text).toBe(
      'Put them in order. A. second / B. first'
    );
    expect(rowWarnings(extracted).join(' ')).toMatch(/ordering question/i);
  });

  it('turns shared text into one passage both questions point at', () => {
    const data = extractedToQuizData(
      quiz({
        texts: [{ id: 'text-1', text: 'A long passage.', label: 'Passage 1' }],
        questions: [
          question({ sharedTextId: 'text-1' }),
          question({ number: 2, sharedTextId: 'text-1' }),
        ],
      })
    );
    expect(data.stimuli).toHaveLength(1);
    expect(data.stimuli?.[0]).toMatchObject({
      type: 'text',
      url: '',
      text: 'A long passage.',
      readAloudSource: 'text',
    });
    const id = data.stimuli?.[0].id;
    expect(data.questions.map((q) => q.stimulusIds)).toEqual([[id], [id]]);
  });

  it('leaves suggested-untick rows out of the quiz but in the review list', () => {
    const data = extractedToQuizData(
      quiz({
        questions: [
          question(),
          question({ number: 2, suggestUntick: 'A survey item.' }),
        ],
      })
    );
    expect(data.questions).toHaveLength(1);
    const extras = reviewExtrasFor(data);
    expect(extras?.allQuestions).toHaveLength(2);
    expect([...(extras?.untick.values() ?? [])]).toEqual(['A survey item.']);
  });

  it('maps learning-target lines by quiz question id', () => {
    const data = extractedToQuizData(
      quiz({
        questions: [
          question({ suggestedTarget: { code: 'ELT 1.1', label: 'I can x.' } }),
        ],
      })
    );
    expect(
      reviewExtrasFor(data)?.suggestedTargets.get(data.questions[0].id)
    ).toEqual({ code: 'ELT 1.1', label: 'I can x.' });
  });
});
