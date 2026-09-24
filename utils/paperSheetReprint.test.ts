import { describe, expect, it } from 'vitest';
import type { PaperBatch, QuizData, QuizQuestion, QuizResponse } from '@/types';
import { bubbleRectMm, QUESTIONS_PER_PAGE } from './paperSheetLayout';
import { buildFilledSheetHtml } from './paperSheetPrint';
import { planSheetReprint, sheetFillFor } from './paperSheetReprint';

const mc = (id: string, correct: string, wrong: string[]): QuizQuestion =>
  ({
    id,
    type: 'MC',
    text: id,
    correctAnswer: correct,
    incorrectAnswers: wrong,
    timeLimit: 0,
  }) as QuizQuestion;

const quiz = (questions: QuizQuestion[]): QuizData =>
  ({
    id: 'quiz',
    title: 'T',
    createdAt: 1,
    updatedAt: 1,
    questions,
  }) as QuizData;

const batch = (over: Partial<PaperBatch> = {}): PaperBatch => ({
  id: 'batch-1',
  quizId: 'quiz',
  rosterIds: [],
  questionCount: 3,
  choiceCount: 4,
  seats: {},
  spareSeats: [],
  pagesPerSheet: 1,
  createdAt: 1,
  ...over,
});

const response = (
  answers: { questionId: string; answer: string; unresponded?: string }[]
): QuizResponse =>
  ({
    studentUid: 'u',
    status: 'completed',
    paperBatchId: 'batch-1',
    paperSeat: 7,
    answers: answers.map((a) => ({ ...a, answeredAt: 1 })),
  }) as unknown as QuizResponse;

const questions = [
  mc('q1', 'Paris', ['Rome', 'Oslo', 'Bern']),
  { ...mc('w', '', []), type: 'free-response' } as QuizQuestion,
  mc('q2', 'Blue', ['Red', 'Green', 'Pink']),
  mc('q3', 'Two', ['One', 'Three', 'Four']),
];

describe('planSheetReprint', () => {
  it('maps each answer to its bubble through the shuffled batch order', () => {
    const plan = planSheetReprint(
      response([
        { questionId: 'q1', answer: 'Oslo' },
        { questionId: 'q2', answer: '', unresponded: 'paper-unclear' },
        { questionId: 'q3', answer: '', unresponded: 'passed' },
      ]),
      batch({
        choiceOrder: {
          q1: ['Rome', 'Paris', 'Oslo', 'Bern'],
          q2: ['Red', 'Blue', 'Green', 'Pink'],
          q3: ['One', 'Two', 'Three', 'Four'],
        },
      }),
      quiz(questions)
    );
    // The written question is not on the sheet, so rows are q1, q2, q3.
    expect(plan).toMatchObject({
      seat: 7,
      questionCount: 3,
      filled: [2, null, null],
      correct: [1, 1, 1],
      unclear: [false, true, false],
      pageCount: 1,
    });
  });

  it('reads a stub batch, which printed bare letters', () => {
    const plan = planSheetReprint(
      response([{ questionId: 'q1', answer: 'C' }]),
      batch(),
      quiz([mc('q1', 'B', ['A', 'C', 'D'])])
    );
    expect(plan?.filled).toEqual([2]);
    expect(plan?.correct).toEqual([1]);
  });

  it('matches option text the way grading does and leaves no bubble for text it cannot place', () => {
    const plan = planSheetReprint(
      response([
        { questionId: 'q1', answer: ' paris ' },
        { questionId: 'q2', answer: 'Mauve' },
      ]),
      batch({
        choiceOrder: {
          q1: ['Rome', 'Paris', 'Oslo', 'Bern'],
          q2: ['Red', 'Blue', 'Green', 'Pink'],
        },
      }),
      quiz([questions[0], questions[2]])
    );
    expect(plan?.filled).toEqual([1, null]);
  });

  it('is null for online work', () => {
    const online = {
      ...response([]),
      paperBatchId: undefined,
    } as QuizResponse;
    expect(planSheetReprint(online, batch(), quiz(questions))).toBeNull();
  });

  it('keeps a long single-column sheet across its printed pages', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      mc(`q${i}`, 'A', ['B', 'C'])
    );
    const plan = planSheetReprint(
      response([]),
      batch({ columnsPerPage: 1, pagesPerSheet: 2 }),
      quiz(many)
    );
    expect(plan).toMatchObject({ columnsPerPage: 1, pageCount: 2 });
  });

  it('carries the question text onto a reprint of a question-text sheet', () => {
    const order = { q1: ['Oslo', 'Paris', 'Rome', 'Bern'] };
    const plan = planSheetReprint(
      response([{ questionId: 'q1', answer: 'Paris' }]),
      batch({ sheetLayout: 'questions', choiceOrder: order }),
      quiz(questions)
    );
    if (!plan) throw new Error('expected a reprint plan');
    expect(plan.columnsPerPage).toBe('questions');
    expect(plan.questionTexts?.[0]).toEqual({
      text: 'q1',
      choices: order.q1,
    });
    const html = buildFilledSheetHtml(
      {
        seat: 7,
        student: null,
        displayName: 'Sam',
        className: '',
        isKeySheet: false,
      },
      {
        batchId: 'batch-1',
        quizTitle: 'T',
        questionCount: plan.questionCount,
        choiceCount: 4,
        columnsPerPage: plan.columnsPerPage,
        questionTexts: plan.questionTexts,
      },
      plan.pageCount,
      sheetFillFor(plan, { markAnswers: true, keyMode: 'all' })
    );
    expect(html).toContain('>Paris</div>');
  });
});

describe('sheetFillFor', () => {
  const plan = {
    batchId: 'b',
    seat: 1,
    questionCount: 4,
    choiceCount: 4,
    columnsPerPage: 2 as const,
    pageCount: 1,
    filled: [1, 2, null, null],
    correct: [1, 1, 1, 1],
    unclear: [false, false, true, false],
  };

  it('marks right and wrong in the margin and "?" on an unclear row', () => {
    expect(
      sheetFillFor(plan, { markAnswers: true, keyMode: 'off' }).marks
    ).toEqual(['correct', 'incorrect', 'unclear', 'incorrect']);
    expect(
      sheetFillFor(plan, { markAnswers: false, keyMode: 'off' }).marks
    ).toEqual([null, null, 'unclear', null]);
  });

  it('rings the key only as the key mode allows', () => {
    const key = (keyMode: 'off' | 'missed' | 'all') =>
      sheetFillFor(plan, { markAnswers: true, keyMode }).key;
    expect(key('off')).toEqual([null, null, null, null]);
    expect(key('missed')).toEqual([null, 1, null, null]);
    expect(key('all')).toEqual([1, 1, 1, 1]);
  });
});

describe('buildFilledSheetHtml', () => {
  const sheetHtml = (filled: (number | null)[], questionCount = 3) =>
    buildFilledSheetHtml(
      {
        seat: 7,
        student: null,
        displayName: 'Ada Lovelace',
        className: 'Period 1',
        isKeySheet: false,
      },
      {
        batchId: 'batch-1',
        quizTitle: 'Capitals',
        questionCount,
        choiceCount: 4,
      },
      Math.ceil(questionCount / QUESTIONS_PER_PAGE),
      {
        filled,
        key: filled.map(() => 1),
        marks: filled.map(() => 'incorrect'),
        score: 'Score: 1 / 3 (33%)',
      }
    );

  it('draws the filled bubble where the blank sheet put it', () => {
    const html = sheetHtml([2, null, 0]);
    const filled = [
      ...html.matchAll(
        /class="bub filled[^"]*" style="left:([\d.]+)mm;top:([\d.]+)mm/g
      ),
    ].map((m) => `${m[1]},${m[2]}`);
    const at = (row: number, choice: number) => {
      const r = bubbleRectMm(row, choice);
      return `${r.x.toFixed(3)},${r.y.toFixed(3)}`;
    };
    expect(filled).toEqual([at(0, 2), at(2, 0)]);
    expect(html.match(/class="bub[^"]*key/g)).toHaveLength(3);
    expect(html).toContain('Score: 1 / 3 (33%)');
  });

  it('carries no marker grid or registration squares, so it can never scan back in', () => {
    const html = sheetHtml([0, 1, 2]);
    expect(html).not.toContain('class="cell"');
    expect(html).not.toContain('class="reg"');
  });

  it('puts row 51 on the second page of a two-column sheet', () => {
    const filled = Array.from({ length: 51 }, (_, i) => (i === 50 ? 3 : null));
    const pages = sheetHtml(filled, 51).split('<div class="sheet">').slice(1);
    expect(pages).toHaveLength(2);
    expect(pages[0]).not.toContain('bub filled');
    const r = bubbleRectMm(0, 3);
    expect(pages[1]).toContain(
      `class="bub filled" style="left:${r.x.toFixed(3)}mm;top:${r.y.toFixed(3)}mm`
    );
  });
});
