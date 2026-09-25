import { describe, expect, it } from 'vitest';
import type { ClassRoster, PaperBatch, QuizData, QuizQuestion } from '@/types';
import type { AssembledSheet, SheetAnswer } from './paperImportAssemble';
import {
  answerTextFor,
  applyKeyToQuiz,
  buildImportPayload,
  keySheetChoices,
  paperImportRequestFields,
  sheetRowQuestionIds,
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

describe('page-map batches (layoutVersion 2)', () => {
  // The printed map, not the live quiz, decides row order: q2 printed first.
  const v2: PaperBatch = {
    ...batch,
    layoutVersion: 2,
    pageMaps: [
      {
        page: 1,
        grid: 2,
        items: [
          {
            kind: 'mc',
            questionId: 'q2',
            sheetRow: 0,
            label: '1',
            originMm: { x: 24, y: 58 },
          },
          {
            kind: 'written',
            questionId: 'fr',
            label: '2',
            headerMm: { x: 24, y: 66, w: 154, h: 13 },
            boxMm: { x: 38, y: 79, w: 140, h: 48 },
            lines: 6,
          },
          {
            kind: 'mc',
            questionId: 'q1',
            sheetRow: 1,
            label: '3',
            originMm: { x: 24, y: 130 },
          },
        ],
      },
    ],
  };
  const writtenSheet = (state: 'ink' | 'blank') =>
    sheet(1, [answer(0, 0), answer(1, 1)], {
      written: [
        {
          questionId: 'fr',
          label: '2',
          page: 1,
          state,
          inkMm2: state === 'ink' ? 30 : 0,
          scanIndex: 0,
        },
      ],
      isBlank: false,
    });

  it('takes row ids from the maps', () => {
    expect(sheetRowQuestionIds(authored, v2)).toEqual(['q2', 'q1']);
    expect(sheetRowQuestionIds(authored, batch)).toEqual(['q1', 'q2']);
    expect(sheetRowQuestionIds(authored)).toEqual(['q1', 'q2']);
  });

  it('sends each box with its crop path, blank ones included, and keeps written questions out of answers', () => {
    for (const state of ['ink', 'blank'] as const) {
      const { payload } = buildImportPayload({
        batch: v2,
        quiz: authored,
        rosters,
        sheets: [writtenSheet(state)],
        spareAssignments: {},
        scan: { uid: 'teacher-1', scanId: 'scan-9' },
      });
      expect(payload[0].answers).toEqual([
        { questionId: 'q2', answer: 'True' },
        { questionId: 'q1', answer: 'Paris' },
      ]);
      expect(payload[0].written).toEqual([
        {
          questionId: 'fr',
          page: 1,
          state,
          storagePath: 'paper_written_crops/teacher-1/scan-9/1/fr.webp',
        },
      ]);
    }
  });

  it('leaves written out when no scan is named, as a review summary does', () => {
    const { payload } = buildImportPayload({
      batch: v2,
      quiz: authored,
      rosters,
      sheets: [writtenSheet('ink')],
      spareAssignments: {},
    });
    expect(payload[0]).not.toHaveProperty('written');
  });

  it('reads the key sheet through the maps', () => {
    expect(
      keySheetChoices(sheet(3, [answer(0, 0), answer(1, 1)]), authored, v2)
    ).toEqual({ q2: 0, q1: 1 });
  });

  it('adds layoutVersion and scanId to the request only for a page-map batch', () => {
    expect(paperImportRequestFields(v2, 'scan-9')).toEqual({
      layoutVersion: 2,
      scanId: 'scan-9',
    });
    expect(paperImportRequestFields(batch, 'scan-9')).toEqual({});
  });
});
