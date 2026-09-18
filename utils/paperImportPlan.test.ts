import { describe, expect, it } from 'vitest';
import type { ClassRoster, PaperBatch, QuizData, QuizQuestion } from '@/types';
import type { AssembledSheet, SheetAnswer } from './paperImportAssemble';
import {
  answerTextFor,
  applyKeyToQuiz,
  buildImportPayload,
  keySheetChoices,
} from './paperImportPlan';
import { buildPaperStubQuiz } from './paperSheetPlan';

const mc = (id: string, correct: string, wrong: string[]): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: id,
  type: 'MC',
  correctAnswer: correct,
  incorrectAnswers: wrong,
});

const authored: QuizData = {
  id: 'quiz-1',
  title: 'Unit 3',
  questions: [
    mc('q1', 'Paris', ['Lyon', 'Nice']),
    {
      id: 'fr',
      timeLimit: 0,
      text: 'essay',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
    },
    mc('q2', 'True', ['False']),
  ],
  createdAt: 0,
  updatedAt: 0,
};

const batch: PaperBatch = {
  id: 'b1',
  quizId: 'quiz-1',
  rosterIds: ['r1'],
  questionCount: 2,
  choiceCount: 3,
  seats: { 1: { rosterId: 'r1', studentId: 's1' } },
  spareSeats: [2],
  keySheetSeat: 3,
  pagesPerSheet: 1,
  choiceOrder: { q1: ['Nice', 'Paris', 'Lyon'], q2: ['True', 'False'] },
  createdAt: 0,
};

const rosters: ClassRoster[] = [
  {
    id: 'r1',
    name: 'Period 1',
    driveFileId: 'f',
    studentCount: 2,
    createdAt: 0,
    students: [
      { id: 's1', firstName: 'Sam', lastName: 'A', pin: '0001' },
      { id: 's2', firstName: 'Jo', lastName: 'B', pin: '0002' },
    ],
  },
];

const answer = (
  question: number,
  choice: number | null,
  doubt?: SheetAnswer['doubt']
): SheetAnswer => ({
  question,
  choice,
  ...(doubt ? { doubt } : {}),
  fills: [],
  crop: { x: 0, y: 0, w: 1, h: 1 },
  scanIndex: 0,
});

const sheet = (
  seat: number,
  answers: SheetAnswer[],
  over: Partial<AssembledSheet> = {}
): AssembledSheet => ({
  seat,
  kind: batch.seats[seat]
    ? 'student'
    : batch.keySheetSeat === seat
      ? 'key'
      : 'spare',
  student: batch.seats[seat] ?? null,
  answers,
  pagesSeen: [1],
  missingPages: [],
  isBlank: answers.every((a) => a.choice === null && !a.doubt),
  flags: [],
  ...over,
});

describe('answerTextFor', () => {
  it('maps a bubble through the printed order, or to the letter for a stub', () => {
    expect(answerTextFor(batch, 'q1', 1)).toBe('Paris');
    expect(answerTextFor({ ...batch, choiceOrder: undefined }, 'q1', 1)).toBe(
      'B'
    );
  });
});

describe('buildImportPayload', () => {
  it('sends pin and period, one answer per sheet row, mapped through the printed order', () => {
    const { payload, skipped } = buildImportPayload({
      batch,
      quiz: authored,
      rosters,
      sheets: [sheet(1, [answer(0, 2), answer(1, null)])],
      spareAssignments: {},
    });
    expect(skipped).toEqual([]);
    expect(payload).toEqual([
      {
        seat: 1,
        rosterId: 'r1',
        pin: '0001',
        classPeriod: 'Period 1',
        answers: [
          { questionId: 'q1', answer: 'Lyon' },
          { questionId: 'q2', answer: '', unresponded: 'passed' },
        ],
      },
    ]);
  });

  it('marks a doubtful row unclear and a missing page passed', () => {
    const { payload } = buildImportPayload({
      batch,
      quiz: authored,
      rosters,
      sheets: [sheet(1, [answer(0, null, 'multiple')], { missingPages: [2] })],
      spareAssignments: {},
    });
    expect(payload[0].answers).toEqual([
      { questionId: 'q1', answer: '', unresponded: 'paper-unclear' },
      { questionId: 'q2', answer: '', unresponded: 'passed' },
    ]);
  });

  it('skips blank sheets, unassigned spares and the key, and imports an assigned spare', () => {
    const { payload, skipped } = buildImportPayload({
      batch,
      quiz: authored,
      rosters,
      sheets: [
        sheet(1, [answer(0, null), answer(1, null)]),
        sheet(2, [answer(0, 0)]),
        sheet(3, [answer(0, 1)]),
      ],
      spareAssignments: {},
    });
    expect(payload).toEqual([]);
    expect(skipped).toEqual([
      { seat: 1, reason: 'blank' },
      { seat: 2, reason: 'unassigned-spare' },
    ]);

    const assigned = buildImportPayload({
      batch,
      quiz: authored,
      rosters,
      sheets: [sheet(2, [answer(0, 0)])],
      spareAssignments: { 2: { rosterId: 'r1', studentId: 's2' } },
    });
    expect(assigned.payload[0]).toMatchObject({ seat: 2, pin: '0002' });
  });

  it('skips a seat whose student is no longer on the roster', () => {
    const { skipped } = buildImportPayload({
      batch: { ...batch, seats: { 1: { rosterId: 'r1', studentId: 'gone' } } },
      quiz: authored,
      rosters,
      sheets: [
        sheet(1, [answer(0, 0)], {
          student: { rosterId: 'r1', studentId: 'gone' },
        }),
      ],
      spareAssignments: {},
    });
    expect(skipped).toEqual([{ seat: 1, reason: 'student-not-found' }]);
  });
});

describe('key sheet', () => {
  it('reads the key by sheet row and writes it into a stub', () => {
    const stub = buildPaperStubQuiz({
      quizId: 'stub',
      title: 'Paper',
      questionCount: 2,
      choiceCount: 4,
      createdAt: 0,
      newQuestionId: (() => {
        let n = 0;
        return () => `s${(n += 1)}`;
      })(),
    });
    const stubBatch: PaperBatch = {
      ...batch,
      choiceOrder: undefined,
      keySheetSeat: 3,
    };
    const key = keySheetChoices(
      sheet(3, [answer(0, 2), answer(1, null, 'unclear')]),
      stub
    );
    expect(key).toEqual({ s1: 2, s2: null });
    const keyed = applyKeyToQuiz(stub, stubBatch, { s1: 2, s2: 0 }, 99);
    expect(keyed.questions[0]).toMatchObject({
      correctAnswer: 'C',
      incorrectAnswers: ['A', 'B', 'D'],
    });
    expect(keyed.questions[1]).toMatchObject({ correctAnswer: 'A' });
    expect(keyed.updatedAt).toBe(99);
  });

  it('leaves a question alone when its key is blank, and maps an authored key through the order', () => {
    const keyed = applyKeyToQuiz(authored, batch, { q1: 0, q2: null }, 5);
    expect(keyed.questions[0]).toMatchObject({
      correctAnswer: 'Nice',
      incorrectAnswers: ['Paris', 'Lyon'],
    });
    expect(keyed.questions[2]).toEqual(authored.questions[2]);
  });
});
