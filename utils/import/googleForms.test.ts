import { describe, expect, it, vi } from 'vitest';
import {
  fetchGoogleForm,
  formFromApi,
  formLeftOutSummary,
  formToExtractedQuiz,
  formToPollQuestions,
} from './googleForms';
import { extractedToQuizData } from '@/utils/quizDocumentImport/toQuizData';
import type { ImportForm } from './contract';

const PIC = (n: number) => `https://lh3.googleusercontent.com/forms-pic-${n}`;

// The shape of a Forms API `forms.get` reply (developers.google.com/forms/api/reference/rest/v1/forms).
const API_REPLY = {
  formId: 'form123',
  info: { title: 'Cells quiz', documentTitle: 'Cells quiz (copy)' },
  settings: { quizSettings: { isQuiz: true } },
  items: [
    {
      itemId: 'a',
      title: 'Look at this cell',
      imageItem: { image: { contentUri: PIC(1) } },
    },
    {
      itemId: 'b',
      title: 'Which part makes energy?',
      questionItem: {
        image: { contentUri: PIC(2) },
        question: {
          grading: {
            pointValue: 2,
            correctAnswers: { answers: [{ value: 'Mitochondria' }] },
          },
          choiceQuestion: {
            type: 'RADIO',
            options: [
              { value: 'Nucleus' },
              { value: 'Mitochondria', image: { contentUri: PIC(3) } },
              { value: 'Ribosome' },
              { isOther: true },
            ],
          },
        },
      },
    },
    {
      itemId: 'c',
      title: 'Pick every organelle',
      questionItem: {
        question: {
          grading: {
            pointValue: 1,
            correctAnswers: {
              answers: [{ value: 'Nucleus' }, { value: 'Vacuole' }],
            },
          },
          choiceQuestion: {
            type: 'CHECKBOX',
            options: [
              { value: 'Nucleus' },
              { value: 'Vacuole' },
              { value: 'Cell wall paint' },
            ],
          },
        },
      },
    },
    {
      itemId: 'd',
      title: 'Name the control center',
      questionItem: {
        question: {
          grading: {
            pointValue: 1,
            correctAnswers: {
              answers: [{ value: 'nucleus' }, { value: 'the nucleus' }],
            },
          },
          textQuestion: {},
        },
      },
    },
    {
      itemId: 'e',
      title: 'Explain osmosis',
      questionItem: { question: { textQuestion: { paragraph: true } } },
    },
    {
      itemId: 'f',
      title: 'How sure are you?',
      questionItem: {
        question: {
          scaleQuestion: {
            low: 1,
            high: 5,
            lowLabel: 'Not',
            highLabel: 'Very',
          },
        },
      },
    },
    {
      itemId: 'g',
      title: 'Match each to its job',
      questionGroupItem: {
        questions: [
          {
            rowQuestion: { title: 'Nucleus' },
            grading: {
              pointValue: 1,
              correctAnswers: { answers: [{ value: 'Control' }] },
            },
          },
          {
            rowQuestion: { title: 'Mitochondria' },
            grading: {
              pointValue: 1,
              correctAnswers: { answers: [{ value: 'Energy' }] },
            },
          },
        ],
        grid: {
          columns: {
            type: 'RADIO',
            options: [{ value: 'Control' }, { value: 'Energy' }],
          },
        },
      },
    },
    {
      itemId: 'h',
      title: 'Birthday',
      questionItem: { question: { dateQuestion: {} } },
    },
    { itemId: 'i', title: 'A clip', videoItem: { video: { youtubeUri: 'x' } } },
    { itemId: 'j', title: 'Section 2', pageBreakItem: {} },
  ],
};

const read = formFromApi(API_REPLY, 'form123');
if (!read) throw new Error('no form');
const { form } = read;

describe('formFromApi', () => {
  it('keeps the title, keys, points and every picture link', () => {
    expect(read.title).toBe('Cells quiz');
    expect(form.formId).toBe('form123');
    expect(form.items[0]).toEqual({
      kind: 'image',
      text: 'Look at this cell',
      image: PIC(1),
    });
    expect(form.items[1]).toEqual({
      kind: 'choice',
      text: 'Which part makes energy?',
      image: PIC(2),
      points: 2,
      options: [
        { text: 'Nucleus' },
        { text: 'Mitochondria', image: PIC(3) },
        { text: 'Ribosome' },
      ],
      correct: ['Mitochondria'],
    });
    expect(form.items[2]).toMatchObject({
      kind: 'checkbox',
      correct: ['Nucleus', 'Vacuole'],
    });
    expect(form.items[3]).toMatchObject({
      kind: 'short',
      correct: ['nucleus', 'the nucleus'],
    });
    expect(form.items[4]).toMatchObject({ kind: 'paragraph' });
    expect(form.items[5]).toMatchObject({
      kind: 'scale',
      low: 1,
      high: 5,
      lowLabel: 'Not',
      highLabel: 'Very',
    });
    expect(form.items[6]).toMatchObject({
      kind: 'grid',
      rows: ['Nucleus', 'Mitochondria'],
      correct: ['Control', 'Energy'],
      points: 1,
    });
    expect(form.leftOut).toEqual({ date: 1, video: 1 });
    expect(form.items).toHaveLength(7);
  });

  it('reads a scale with no low as starting at 0', () => {
    const got = formFromApi(
      {
        items: [
          {
            title: 'Zero to ten',
            questionItem: { question: { scaleQuestion: { high: 10 } } },
          },
        ],
      },
      'f'
    );
    expect(got?.form.items[0]).toMatchObject({ low: 0, high: 10 });
  });

  it('refuses a reply that is not a form', () => {
    expect(formFromApi({ error: { code: 403 } }, 'x')).toBeNull();
  });
});

describe('fetchGoogleForm', () => {
  it('calls the Forms API with the token', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(API_REPLY)))
    );
    const got = await fetchGoogleForm('form123', 'tok', fetchFn);
    expect(got?.title).toBe('Cells quiz');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://forms.googleapis.com/v1/forms/form123',
      {
        headers: { Authorization: 'Bearer tok' },
      }
    );
  });

  it('gives null when Google refuses, so the page read is used', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response('{}', { status: 403 }))
    );
    expect(await fetchGoogleForm('form123', 'tok', fetchFn)).toBeNull();
  });
});

describe('formToExtractedQuiz', () => {
  const fetchImage = vi.fn((url: string) =>
    Promise.resolve(
      url === PIC(3)
        ? null
        : { blob: new Blob([url]), contentType: 'image/png' }
    )
  );

  it('maps each kind, carries keys and points, and copies the pictures', async () => {
    const extracted = await formToExtractedQuiz(read.title, form, fetchImage);
    const qs = extracted.questions;
    expect(qs.map((q) => q.type)).toEqual([
      'MC',
      'MA',
      'FIB',
      'free-response',
      'MC',
      'MC',
    ]);
    // The picture on its own and the question's picture both show with the question.
    expect(qs[0].imageIds).toHaveLength(2);
    expect(qs[0]).toMatchObject({ correctAnswer: 'Mitochondria', points: 2 });
    expect(qs[1].correctAnswer).toBe('Nucleus|Vacuole');
    expect(qs[2]).toMatchObject({
      correctAnswer: 'nucleus',
      blankAlternates: [{ answers: ['the nucleus'] }],
    });
    // The rating scale stays out of the quiz.
    expect(qs.some((q) => q.text === 'How sure are you?')).toBe(false);
    expect(qs[4]).toMatchObject({
      text: 'Match each to its job: Nucleus',
      correctAnswer: 'Control',
    });
    expect(qs[5]).toMatchObject({
      text: 'Match each to its job: Mitochondria',
      correctAnswer: 'Energy',
    });
    expect(extracted.images).toHaveLength(2);
    expect(extracted.warnings).toEqual([
      'Rating scales are not supported in quizzes.',
      'Skipped: 1 date question, 1 video and 1 picture.',
    ]);
  });

  it('builds a quiz whose pictures point at the copied images', async () => {
    const extracted = await formToExtractedQuiz(read.title, form, fetchImage);
    const quiz = extractedToQuizData(extracted);
    const ids = new Set(extracted.images.map((i) => i.id));
    expect(quiz.title).toBe('Cells quiz');
    expect(quiz.questions[0].stimulusIds?.every((id) => ids.has(id))).toBe(
      true
    );
    expect(quiz.questions).toHaveLength(6);
    expect(quiz.questions.some((q) => q.needsKey)).toBe(false);
  });

  it('keeps a choice picture beside its words and shows the words', async () => {
    const all = vi.fn((url: string) =>
      Promise.resolve({ blob: new Blob([url]), contentType: 'image/png' })
    );
    const quiz = extractedToQuizData(
      await formToExtractedQuiz(read.title, form, all)
    );
    expect(quiz.questions[0].answerImages).toEqual([
      { text: 'Mitochondria', url: expect.any(String) as unknown },
    ]);
    expect(quiz.questions[0].imageOnlyAnswers).toBeUndefined();
  });

  it('marks an unkeyed page read for a key, and fits long choice lists', async () => {
    const page: ImportForm = {
      items: [
        {
          kind: 'choice',
          text: 'Pick one',
          options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((text) => ({
            text,
          })),
        },
      ],
    };
    const extracted = await formToExtractedQuiz('Page', page, fetchImage);
    expect(extracted.questions[0].options).toHaveLength(5);
    expect(extractedToQuizData(extracted).questions[0].needsKey).toBe(true);
    expect(extracted.questions[0].warnings).toEqual([
      'Answer choice limit exceeded. Options imported: a; b; c; d; e.',
    ]);
    expect(extracted.warnings[0]).toBe(
      'Maximum answer options is 5. Additional options are skipped.'
    );
  });
});

describe('formToExtractedQuiz untick and choice room', () => {
  const none = () => Promise.resolve(null);
  it('shows a picture after the last question with that question', async () => {
    const pic = () =>
      Promise.resolve({ blob: new Blob(['p']), contentType: 'image/png' });
    const extracted = await formToExtractedQuiz(
      'x',
      {
        items: [
          { kind: 'short', text: 'Name the organelle' },
          { kind: 'image', text: '', image: PIC(9) },
        ],
      },
      pic
    );
    expect(extracted.questions[0].imageIds).toHaveLength(1);
  });

  it('starts a name or email question unticked', async () => {
    const extracted = await formToExtractedQuiz(
      'x',
      {
        items: [
          { kind: 'short', text: 'Your Name' },
          { kind: 'short', text: 'Email address' },
          { kind: 'short', text: 'Name the organelle that makes energy' },
        ],
      },
      none
    );
    expect(extracted.questions.map((q) => !!q.suggestUntick)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('keeps every choice of an unkeyed choose-all question up to both lists', async () => {
    const extracted = await formToExtractedQuiz(
      'x',
      {
        items: [
          {
            kind: 'checkbox',
            text: 'Which apply?',
            options: Array.from({ length: 9 }, (_, i) => ({ text: `c${i}` })),
          },
        ],
      },
      none
    );
    expect(extracted.questions[0].options).toHaveLength(9);
    expect(extracted.warnings).toEqual([]);
  });
});

describe('formToPollQuestions', () => {
  it('turns choices, scales and written answers into poll questions with the key marked', () => {
    const { questions, over } = formToPollQuestions(form);
    expect(over).toBe(0);
    expect(questions.map((q) => q.kind)).toEqual([
      'choice',
      'choice',
      'words',
      'text',
      'scale',
      'choice',
      'choice',
    ]);
    expect(questions[0].options.find((o) => o.correct)?.label).toBe(
      'Mitochondria'
    );
    expect(questions[4]).toMatchObject({ scaleLow: 'Not', scaleHigh: 'Very' });
    expect(questions[4].options.map((o) => o.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
  });

  it('votes on an odd scale as numbered choices and stops at 20 questions', () => {
    const many: ImportForm = {
      items: [
        { kind: 'scale', text: 'Zero to three', low: 0, high: 3 },
        ...Array.from({ length: 24 }, (_, i) => ({
          kind: 'short' as const,
          text: `Q${i}`,
        })),
      ],
    };
    const { questions, over } = formToPollQuestions(many);
    expect(questions[0]).toMatchObject({ kind: 'choice' });
    expect(questions[0].options.map((o) => o.label)).toEqual([
      '0',
      '1',
      '2',
      '3',
    ]);
    expect(questions).toHaveLength(20);
    expect(over).toBe(5);
  });
});

describe('formLeftOutSummary', () => {
  it('is null when nothing was skipped', () => {
    expect(formLeftOutSummary({})).toBeNull();
  });
});
