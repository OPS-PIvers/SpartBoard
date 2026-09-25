// The delegated print path plans the batch on the server (D16) while the
// self-print path plans it in the browser, and `functions/` cannot import the
// client util. Both copies must seat a stack identically — otherwise a scan
// decodes against a different seat map than the paper carries.

import { describe, it, expect } from 'vitest';
import type { ClassRoster, QuizData, QuizQuestion, Student } from '@/types';
import {
  analyzePaperQuiz as clientAnalyze,
  paperChoiceOrder as clientChoiceOrder,
  planPaperBatch as clientPlan,
} from '@/utils/paperSheetPlan';
import {
  planPaperPages as clientPages,
  type PaperSheetEntry,
} from '@/utils/paperPageMap';
import { MAX_PAGE as CLIENT_MAX_PAGE } from '@/utils/paperSheetMarker';
import {
  analyzePaperQuiz as serverAnalyze,
  paperChoiceOrder as serverChoiceOrder,
  planPaperBatch as serverPlan,
  planPaperPages as serverPages,
  MAX_PAGE,
  MAX_SEAT,
} from '@/functions/src/paperBatchPlan';
import type { PaperBoxSize, PaperGrid } from '@/types';

const question = (
  id: string,
  correctAnswer: string,
  incorrectAnswers: string[],
  type: QuizQuestion['type'] = 'MC'
): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type,
  correctAnswer,
  incorrectAnswers,
  points: 1,
});

const QUESTIONS: QuizQuestion[] = [
  question('q1', 'Paris', ['Lyon', 'Nice', 'Brest']),
  question('q2', 'True', ['False']),
  question('q3', 'Mitochondrion', ['Ribosome']),
  question('q4', 'Alpha', ['Beta', 'Gamma', 'Delta', 'Epsilon']),
  question('q5', 'Essay answer', [], 'FIB'),
];

const student = (id: string, firstName: string, lastName: string): Student => ({
  id,
  firstName,
  lastName,
  pin: '07',
});

const roster = (
  id: string,
  name: string,
  students: Student[]
): ClassRoster => ({
  id,
  name,
  driveFileId: `drive-${id}`,
  studentCount: students.length,
  createdAt: 1,
  students,
});

const PERIOD_1 = roster('r1', 'Period 1', [
  student('s1', 'Ada', 'Byron'),
  student('s2', 'Alan', 'Turing'),
  student('s3', 'Grace', ''),
]);
const PERIOD_4 = roster('r4', 'Period 4', [student('s4', '', 'Hopper')]);

const BATCH_ID = '7f1d0c2a-2c6e-4f0b-9d1c-3a5b6c7d8e9f';

const clientInput = {
  batchId: BATCH_ID,
  quizId: 'quiz-1',
  selections: [
    { roster: PERIOD_1, students: PERIOD_1.students },
    { roster: PERIOD_4, students: PERIOD_4.students },
  ],
  questionCount: 4,
  choiceCount: 5,
  spareCount: 3,
  includeKeySheet: true,
  questions: QUESTIONS.slice(0, 4),
  createdAt: 1_700_000_000_000,
};

/** The same input, through the server's structurally narrower types. */
const serverInput = {
  ...clientInput,
  selections: clientInput.selections.map((s) => ({
    roster: { id: s.roster.id, name: s.roster.name },
    students: s.students.map((st) => ({
      id: st.id,
      firstName: st.firstName,
      lastName: st.lastName,
    })),
  })),
};

describe('client/server paper batch plan parity', () => {
  it('seats a whole stack identically', () => {
    const client = clientPlan(clientInput);
    const server = serverPlan(serverInput);
    expect(server.batch).toEqual(client.batch);
    expect(server.sheets).toEqual(client.sheets);
  });

  it('agrees with no spares, no key sheet and one empty class', () => {
    const bare = {
      ...clientInput,
      spareCount: 0,
      includeKeySheet: false,
      selections: [{ roster: PERIOD_4, students: [] }],
    };
    const client = clientPlan(bare);
    const server = serverPlan({
      ...bare,
      selections: [
        { roster: { id: PERIOD_4.id, name: PERIOD_4.name }, students: [] },
      ],
    });
    expect(server.batch).toEqual(client.batch);
    expect(server.sheets).toEqual(client.sheets);
  });

  it('records the same layout and page count on a single-column batch', () => {
    const wide = { ...clientInput, questionCount: 40 };
    const narrow = { ...wide, columnsPerPage: 1 as const };
    const client = clientPlan(narrow);
    const server = serverPlan({ ...serverInput, ...narrow });
    expect(server.batch).toEqual(client.batch);
    expect(client.batch.columnsPerPage).toBe(1);
    expect(client.batch.pagesPerSheet).toBe(2);
    // Two columns stays the document it always was: no field, half the pages.
    const asBefore = clientPlan(wide).batch;
    expect('columnsPerPage' in asBefore).toBe(false);
    expect(asBefore.pagesPerSheet).toBe(1);
    expect(serverPlan({ ...serverInput, ...wide }).batch).toEqual(asBefore);
  });

  it('clamps an out-of-range choice count the same way', () => {
    for (const choiceCount of [0, 1, 6, 99]) {
      expect(
        serverPlan({ ...serverInput, choiceCount }).batch.choiceCount
      ).toBe(clientPlan({ ...clientInput, choiceCount }).batch.choiceCount);
    }
  });

  it('letters every question in the same order, seeded by batch', () => {
    for (const q of QUESTIONS) {
      expect(serverChoiceOrder(BATCH_ID, q)).toEqual(
        clientChoiceOrder(BATCH_ID, q)
      );
      // A different batch reshuffles — and must reshuffle the same way.
      expect(serverChoiceOrder('other-batch', q)).toEqual(
        clientChoiceOrder('other-batch', q)
      );
    }
    const stub = question('q6', 'C', ['A', 'B', 'D']);
    expect(serverChoiceOrder(BATCH_ID, stub)).toEqual(
      clientChoiceOrder(BATCH_ID, stub)
    );
  });

  it('picks the same printable rows out of a mixed quiz', () => {
    const quiz: QuizData = {
      id: 'quiz-1',
      title: 'Unit 3',
      questions: QUESTIONS,
      createdAt: 1,
      updatedAt: 1,
    };
    const client = clientAnalyze(quiz);
    const server = serverAnalyze(QUESTIONS);
    expect(server.rows).toEqual(client.rows);
    expect(server.sheetChoiceCount).toBe(client.sheetChoiceCount);
    expect(server.shortRows).toEqual(client.shortRows);
  });

  it('analyzes a quiz with no printable question the same way', () => {
    const none = [QUESTIONS[4]];
    const client = clientAnalyze({
      id: 'q',
      title: 'Free response only',
      questions: none,
      createdAt: 1,
      updatedAt: 1,
    });
    const server = serverAnalyze(none);
    expect(server.rows).toEqual([]);
    expect(server.sheetChoiceCount).toBe(client.sheetChoiceCount);
  });

  it('refuses a run past the last seat the marker can carry', () => {
    const tooMany = {
      ...clientInput,
      selections: [],
      spareCount: MAX_SEAT + 1,
      includeKeySheet: false,
      questions: undefined,
    };
    expect(() => clientPlan(tooMany)).toThrow(RangeError);
    expect(() => serverPlan({ ...tooMany, selections: [] })).toThrow(
      RangeError
    );
  });
});

describe('client/server page map parity (layoutVersion 2)', () => {
  const mc = (n: number): PaperSheetEntry => ({
    kind: 'mc',
    questionId: `m${n}`,
    label: String(n),
  });
  const box = (n: number, size: PaperBoxSize): PaperSheetEntry => ({
    kind: 'written',
    questionId: `w${n}`,
    label: String(n),
    size,
  });
  const run = (from: number, count: number): PaperSheetEntry[] =>
    Array.from({ length: count }, (_, i) => mc(from + i));

  const SHEETS: Record<string, PaperSheetEntry[]> = {
    'MC only, one page': run(1, 12),
    'MC only, spills to page two': run(1, 73),
    'no questions': [],
    'box between runs': [...run(1, 5), box(6, 'M'), ...run(7, 4)],
    'every size': [
      box(1, 'S'),
      ...run(2, 3),
      box(5, 'M'),
      box(6, 'L'),
      ...run(7, 9),
      box(16, 'full'),
      ...run(17, 2),
    ],
    'boxes that overflow a page': [
      ...run(1, 20),
      box(21, 'L'),
      box(22, 'L'),
      box(23, 'M'),
      ...run(24, 40),
      box(64, 'S'),
    ],
    'written only': [box(1, 'M'), box(2, 'S'), box(3, 'full'), box(4, 'L')],
  };
  const GRIDS: PaperGrid[] = [1, 2, 'questions'];

  it('lays out every sheet identically on every grid, with and without stems', () => {
    for (const [name, entries] of Object.entries(SHEETS)) {
      for (const grid of GRIDS) {
        for (const stems of [true, false]) {
          const input = { entries, grid, stems };
          expect(serverPages(input), `${name} / ${grid} / ${stems}`).toEqual(
            clientPages(input)
          );
        }
      }
    }
  });

  it('refuses the same sheet past the last page the marker can carry', () => {
    expect(MAX_PAGE).toBe(CLIENT_MAX_PAGE);
    const entries = Array.from({ length: MAX_PAGE + 1 }, (_, i) =>
      box(i + 1, 'full')
    );
    const client = clientPages({ entries, grid: 2, stems: true });
    expect(client.ok).toBe(false);
    expect(serverPages({ entries, grid: 2, stems: true })).toEqual(client);
  });

  it('stamps the same layoutVersion 2 batch from the same maps', () => {
    const planned = clientPages({
      entries: SHEETS['every size'],
      grid: 2,
      stems: true,
    });
    if (!planned.ok) throw new Error('expected a layout');
    const withMaps = { pageMaps: planned.pageMaps };
    const client = clientPlan({ ...clientInput, ...withMaps });
    const server = serverPlan({ ...serverInput, ...withMaps });
    expect(server.batch).toEqual(client.batch);
    expect(client.batch.layoutVersion).toBe(2);
    expect(client.batch.pagesPerSheet).toBe(planned.pageMaps.length);
    expect(server.sheets).toEqual(client.sheets);
  });

  const writtenQuiz = (
    questions: QuizQuestion[],
    extra: Partial<QuizData> = {}
  ): QuizData => ({
    id: 'quiz-w',
    title: 'Written',
    questions,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  });
  const free = (
    id: string,
    extra: Partial<QuizQuestion> = {}
  ): QuizQuestion => ({
    ...question(id, '', [], 'free-response'),
    ...extra,
  });

  it('picks the same rows, boxes and numbers out of a quiz with written questions', () => {
    const questions = [
      QUESTIONS[0],
      free('f1'),
      QUESTIONS[4],
      free('f2', { maxWords: 25 }),
      free('f3', { paperBoxSize: 'full' }),
      free('f4', { maxWords: 500 }),
      free('rec', { recording: { maxDurationSeconds: 60 } as never }),
      QUESTIONS[1],
    ];
    const quiz = writtenQuiz(questions);
    for (const written of [true, false]) {
      const client = clientAnalyze(quiz, { written });
      const server = serverAnalyze(questions, { written });
      expect(server.rows).toEqual(client.rows);
      expect(server.written).toEqual(client.written);
      expect(server.entries).toEqual(client.entries);
      expect(server.sheetChoiceCount).toBe(client.sheetChoiceCount);
      expect(server.writtenRefusals).toEqual(
        client.writtenRefusals.map((r) => r.label)
      );
    }
    expect(clientAnalyze(quiz, { written: true }).written).toHaveLength(4);
  });

  it('refuses the same written questions inside an "answer any" section', () => {
    const questions = [QUESTIONS[0], free('f1'), free('f2'), free('f3')];
    const extra: Partial<QuizData> = {
      sections: [
        { id: 'choose', title: 'Pick one', chooseCount: 1 },
        { id: 'all', title: 'Answer all' },
      ],
      order: [
        { kind: 'question', id: QUESTIONS[0].id },
        { kind: 'section', id: 'choose' },
        { kind: 'question', id: 'f1' },
        { kind: 'question', id: 'f2' },
        { kind: 'section', id: 'all' },
        { kind: 'question', id: 'f3' },
      ],
    };
    const client = clientAnalyze(writtenQuiz(questions, extra), {
      written: true,
    });
    const server = serverAnalyze(questions, {
      written: true,
      sections: extra.sections,
      order: extra.order,
    });
    expect(client.writtenRefusals.map((r) => r.label)).toEqual([
      '2. Question f1',
      '3. Question f2',
    ]);
    expect(server.writtenRefusals).toEqual(
      client.writtenRefusals.map((r) => r.label)
    );
    expect(server.entries).toEqual(client.entries);
  });

  it('lays out an analyzed quiz end to end the same way', () => {
    const questions = [
      ...QUESTIONS.slice(0, 4),
      free('f1', { paperBoxSize: 'L' }),
      QUESTIONS[0],
      free('f2'),
    ];
    const client = clientAnalyze(writtenQuiz(questions), { written: true });
    const server = serverAnalyze(questions, { written: true });
    for (const grid of GRIDS) {
      expect(
        serverPages({ entries: server.entries, grid, stems: true })
      ).toEqual(clientPages({ entries: client.entries, grid, stems: true }));
    }
  });
});
