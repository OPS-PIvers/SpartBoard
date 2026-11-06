import { describe, expect, it } from 'vitest';
import type { ClassRoster, QuizData, QuizQuestion } from '@/types';
import {
  hybridPrintJob,
  paperWrittenQuestionIds,
  planHybridWrittenBatch,
  writtenOnlyAnalysis,
} from '@/utils/paperWrittenHybrid';
import { reprintBlocker } from '@/utils/paperReprint';
import { buildPaperSheetsHtml } from '@/utils/paperSheetPrint';

const mc = (id: string): QuizQuestion => ({
  id,
  type: 'MC',
  text: `Question ${id}`,
  correctAnswer: 'A',
  incorrectAnswers: ['B', 'C', 'D'],
  timeLimit: 0,
});

const fr = (id: string, extra: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({
    id,
    type: 'free-response',
    text: `Explain ${id}`,
    correctAnswer: '',
    timeLimit: 0,
    ...extra,
  }) as QuizQuestion;

const quiz = (questions: QuizQuestion[]): QuizData => ({
  id: 'quiz-1',
  title: 'Gravity',
  questions,
  createdAt: 0,
  updatedAt: 0,
});

const roster: ClassRoster = {
  id: 'r1',
  name: 'Period 1',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  students: [
    { id: 's1', firstName: 'Ana', lastName: 'Berg', pin: '01' },
    { id: 's2', firstName: 'Cy', lastName: 'Adams', pin: '02' },
  ],
};

const QUIZ = quiz([mc('m1'), mc('m2'), fr('w1'), mc('m3'), fr('w2')]);

describe('writtenOnlyAnalysis', () => {
  it('keeps the written boxes, numbered by quiz position, and drops every bubble row', () => {
    const a = writtenOnlyAnalysis(QUIZ);
    expect(a.rows).toEqual([]);
    expect(a.entries.map((e) => [e.kind, e.questionId, e.label])).toEqual([
      ['written', 'w1', '3'],
      ['written', 'w2', '5'],
    ]);
  });
});

describe('paperWrittenQuestionIds', () => {
  it('lists the written questions that can print', () => {
    expect(paperWrittenQuestionIds(QUIZ)).toEqual(['w1', 'w2']);
  });

  it('is empty for a quiz with no written questions', () => {
    expect(paperWrittenQuestionIds(quiz([mc('m1')]))).toEqual([]);
  });

  it('is empty for a quiz that draws from banks', () => {
    const banked = {
      ...QUIZ,
      bankSlots: [{ id: 'slot' }],
    } as unknown as QuizData;
    expect(paperWrittenQuestionIds(banked)).toEqual([]);
  });
});

describe('planHybridWrittenBatch', () => {
  it('seats every student of a whole class, then the spares, with no bubble rows', () => {
    const plan = planHybridWrittenBatch({
      quiz: QUIZ,
      classes: { classIds: ['r1'], studentsByClass: {} },
      rosters: [roster],
      spareCount: 2,
      batchId: 'b1',
      now: 1,
    });
    if (!plan.ok) throw new Error('expected a plan');
    expect(plan.questionIds).toEqual(['w1', 'w2']);
    expect(plan.batch.questionCount).toBe(0);
    expect(plan.batch.spareSeats).toHaveLength(2);
    expect(Object.values(plan.batch.seats).map((s) => s.studentId)).toEqual([
      's2',
      's1',
    ]);
    const items = (plan.batch.pageMaps ?? []).flatMap((m) => m.items);
    expect(items.every((i) => i.kind === 'written')).toBe(true);
    expect(reprintBlocker(plan.batch, writtenOnlyAnalysis(QUIZ))).toBeNull();
  });

  it('refuses a quiz with nothing to print', () => {
    const plan = planHybridWrittenBatch({
      quiz: quiz([mc('m1')]),
      classes: { classIds: ['r1'], studentsByClass: {} },
      rosters: [roster],
      spareCount: 0,
      batchId: 'b1',
      now: 1,
    });
    expect(plan).toEqual({ ok: false, reason: 'none' });
  });

  it('prints a sheet per seat with the written stems', () => {
    const plan = planHybridWrittenBatch({
      quiz: QUIZ,
      classes: { classIds: ['r1'], studentsByClass: {} },
      rosters: [roster],
      spareCount: 0,
      batchId: 'b1',
      now: 1,
    });
    if (!plan.ok) throw new Error('expected a plan');
    const html = buildPaperSheetsHtml(
      hybridPrintJob(QUIZ, plan.batch, plan.sheets)
    );
    expect(html).toContain('Explain w1');
    expect(html).toContain('Explain w2');
    expect(html).not.toContain('class="bub');
  });
});
