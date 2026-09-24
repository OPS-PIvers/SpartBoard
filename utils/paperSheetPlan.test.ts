import { describe, expect, it } from 'vitest';
import type { ClassRoster, QuizData, QuizQuestion, Student } from '@/types';
import { MAX_SEAT } from './paperSheetMarker';
import {
  analyzePaperQuiz,
  buildPaperStubQuiz,
  planPaperBatch,
  paperChoiceOrder,
} from './paperSheetPlan';

const mc = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'Capital of France?',
  type: 'MC',
  correctAnswer: 'Paris',
  incorrectAnswers: ['Lyon', 'Nice'],
  ...over,
});

const quiz = (over: Partial<QuizData> = {}): QuizData => ({
  id: 'quiz-1',
  title: 'Unit 3',
  questions: [mc()],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const student = (id: string, last: string, pin: string): Student => ({
  id,
  firstName: 'Sam',
  lastName: last,
  pin,
});

const roster = (id: string, name: string): ClassRoster => ({
  id,
  name,
  driveFileId: null,
  studentCount: 0,
  createdAt: 0,
  students: [],
});

describe('analyzePaperQuiz', () => {
  it('keeps multiple-choice questions and numbers them in order', () => {
    const result = analyzePaperQuiz(
      quiz({ questions: [mc({ id: 'a' }), mc({ id: 'b' }), mc({ id: 'c' })] })
    );
    expect(result.rows.map((r) => [r.row, r.questionId])).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    expect(result.exclusions).toEqual([]);
  });

  it('treats a two-choice question as the True/False case', () => {
    const result = analyzePaperQuiz(
      quiz({
        questions: [mc({ incorrectAnswers: ['False'], correctAnswer: 'True' })],
      })
    );
    expect(result.sheetChoiceCount).toBe(2);
    expect(result.shortRows).toEqual([]);
  });

  it('excludes every question type paper cannot carry', () => {
    const result = analyzePaperQuiz(
      quiz({
        questions: [
          mc({ id: 'keep' }),
          mc({ id: 'fib', type: 'FIB', text: 'Blank' }),
          mc({ id: 'match', type: 'Matching', text: 'Pairs' }),
          mc({ id: 'order', type: 'Ordering', text: 'Sequence' }),
          mc({ id: 'fr', type: 'free-response', text: 'Explain' }),
        ],
      })
    );
    expect(result.rows.map((r) => r.questionId)).toEqual(['keep']);
    expect(result.exclusions).toHaveLength(4);
    expect(result.exclusions.every((e) => e.reason === 'question-type')).toBe(
      true
    );
    expect(result.exclusions[0].label).toContain('Fill in the blank');
  });

  it('excludes bank slots, which draw a different paper for each student', () => {
    const result = analyzePaperQuiz(
      quiz({
        bankSlots: [
          {
            id: 's1',
            bankId: 'b1',
            bankTitle: 'Unit 3 bank',
            mode: 'random',
            count: 5,
          },
          {
            id: 's2',
            bankId: 'b2',
            bankTitle: 'Review bank',
            mode: 'selected',
            questionIds: ['x', 'y'],
          },
        ],
      })
    );
    expect(result.exclusions.map((e) => e.reason)).toEqual([
      'bank-slot',
      'bank-slot',
    ]);
    expect(result.exclusions[0].label).toContain('5 drawn at random');
    expect(result.exclusions[1].label).toContain('2 selected');
  });

  it('prints one bubble count for the sheet and names the short rows', () => {
    const result = analyzePaperQuiz(
      quiz({
        questions: [
          mc({ id: 'a', incorrectAnswers: ['1', '2', '3'] }),
          mc({ id: 'b', incorrectAnswers: ['1'] }),
          mc({ id: 'c', incorrectAnswers: ['1', '2', '3'] }),
        ],
      })
    );
    expect(result.sheetChoiceCount).toBe(4);
    expect(result.shortRows).toEqual([2]);
  });

  it('caps a question with more distractors than a sheet can print', () => {
    const result = analyzePaperQuiz(
      quiz({
        questions: [mc({ incorrectAnswers: ['1', '2', '3', '4', '5', '6'] })],
      })
    );
    expect(result.sheetChoiceCount).toBe(5);
  });

  it('survives a stub quiz with no questions at all', () => {
    const result = analyzePaperQuiz(quiz({ questions: [] }));
    expect(result.rows).toEqual([]);
    expect(result.sheetChoiceCount).toBe(2);
  });
});

describe('planPaperBatch', () => {
  const base = {
    batchId: 'batch-1',
    quizId: 'quiz-1',
    questionCount: 20,
    choiceCount: 4,
    spareCount: 0,
    includeKeySheet: false,
    createdAt: 1000,
  };

  const twoClasses = [
    {
      roster: roster('r1', 'Period 1'),
      students: [student('s1', 'Alvarez', '01'), student('s2', 'Baker', '02')],
    },
    {
      roster: roster('r2', 'Period 3'),
      students: [student('s3', 'Chen', '01')],
    },
  ];

  it('numbers seats across rosters and records which roster each came from', () => {
    const { batch, sheets } = planPaperBatch({
      ...base,
      selections: twoClasses,
    });
    expect(sheets.map((s) => s.seat)).toEqual([1, 2, 3]);
    expect(batch.seats).toEqual({
      1: { rosterId: 'r1', studentId: 's1' },
      2: { rosterId: 'r1', studentId: 's2' },
      3: { rosterId: 'r2', studentId: 's3' },
    });
    expect(batch.rosterIds).toEqual(['r1', 'r2']);
  });

  it('keeps the same PIN in two classes apart', () => {
    const { batch } = planPaperBatch({ ...base, selections: twoClasses });
    expect(batch.seats[1].rosterId).not.toBe(batch.seats[3].rosterId);
  });

  it('labels sheets with the student name and class for handing out', () => {
    const { sheets } = planPaperBatch({ ...base, selections: twoClasses });
    expect(sheets[0].displayName).toBe('Alvarez, Sam');
    expect(sheets[0].className).toBe('Period 1');
  });

  it('gives spares a seat of their own but no student', () => {
    const { batch, sheets } = planPaperBatch({
      ...base,
      selections: twoClasses,
      spareCount: 2,
    });
    expect(batch.spareSeats).toEqual([4, 5]);
    expect(Object.keys(batch.seats)).toHaveLength(3);
    expect(
      sheets.filter((s) => s.student === null && !s.isKeySheet)
    ).toHaveLength(2);
  });

  it('gives the answer key its own seat so it is not mistaken for a student', () => {
    const { batch, sheets } = planPaperBatch({
      ...base,
      selections: twoClasses,
      spareCount: 1,
      includeKeySheet: true,
    });
    expect(batch.keySheetSeat).toBe(5);
    expect(batch.spareSeats).not.toContain(5);
    expect(batch.seats[5]).toBeUndefined();
    expect(sheets.at(-1)).toMatchObject({ seat: 5, isKeySheet: true });
  });

  it('omits keySheetSeat entirely when no key was printed', () => {
    const { batch } = planPaperBatch({ ...base, selections: twoClasses });
    expect('keySheetSeat' in batch).toBe(false);
  });

  it('gives every sheet in the run a distinct seat', () => {
    const { sheets } = planPaperBatch({
      ...base,
      selections: twoClasses,
      spareCount: 3,
      includeKeySheet: true,
    });
    expect(new Set(sheets.map((s) => s.seat)).size).toBe(sheets.length);
  });

  it('paginates long tests and clamps an out-of-range choice count', () => {
    const { batch } = planPaperBatch({
      ...base,
      selections: twoClasses,
      questionCount: 120,
      choiceCount: 9,
    });
    expect(batch.pagesPerSheet).toBe(3);
    expect(batch.choiceCount).toBe(5);
  });

  it('refuses a run larger than the marker can number', () => {
    const students = Array.from({ length: MAX_SEAT + 1 }, (_, i) =>
      student(`s${i}`, `Student${i}`, String(i))
    );
    expect(() =>
      planPaperBatch({
        ...base,
        selections: [{ roster: roster('r1', 'Big'), students }],
      })
    ).toThrow(RangeError);
  });
});

describe('paperChoiceOrder', () => {
  const question = (id: string, correct: string, wrong: string[]) => ({
    id,
    timeLimit: 0,
    text: id,
    type: 'MC' as const,
    correctAnswer: correct,
    incorrectAnswers: wrong,
  });

  it('is a permutation of the options, stable for the same batch and question', () => {
    const q = question('q1', 'Paris', ['Lyon', 'Nice', 'Lille']);
    const order = paperChoiceOrder('batch-1', q);
    expect([...order].sort()).toEqual(['Lille', 'Lyon', 'Nice', 'Paris']);
    expect(paperChoiceOrder('batch-1', q)).toEqual(order);
  });

  it('does not always put the correct answer first', () => {
    const positions = new Set(
      Array.from({ length: 40 }, (_, i) =>
        paperChoiceOrder(
          'batch-1',
          question(`q${i}`, 'right', ['a', 'b', 'c'])
        ).indexOf('right')
      )
    );
    expect(positions.size).toBeGreaterThan(1);
  });

  it('keeps True before False', () => {
    expect(
      paperChoiceOrder('batch-1', question('q1', 'False', ['True']))
    ).toEqual(['True', 'False']);
    expect(
      paperChoiceOrder('batch-9', question('q2', 'true', ['false']))
    ).toEqual(['true', 'false']);
  });

  it('is recorded on the batch for every authored question, and not for a stub', () => {
    const questions = [
      question('q1', 'Paris', ['Lyon']),
      question('q2', 'Red', ['Blue', 'Green']),
    ];
    const { batch } = planPaperBatch({
      batchId: 'batch-1',
      quizId: 'quiz-1',
      selections: [],
      questionCount: 2,
      choiceCount: 3,
      spareCount: 1,
      includeKeySheet: false,
      questions,
      createdAt: 0,
    });
    expect(Object.keys(batch.choiceOrder ?? {})).toEqual(['q1', 'q2']);
    expect([...(batch.choiceOrder?.q2 ?? [])].sort()).toEqual([
      'Blue',
      'Green',
      'Red',
    ]);
    const stub = planPaperBatch({
      batchId: 'batch-1',
      quizId: 'quiz-1',
      selections: [],
      questionCount: 2,
      choiceCount: 3,
      spareCount: 1,
      includeKeySheet: true,
      createdAt: 0,
    });
    expect(stub.batch).not.toHaveProperty('choiceOrder');
  });

  it('keeps the order a paper SpartBoard did not lay out, unshuffled', () => {
    const { batch } = planPaperBatch({
      batchId: 'batch-1',
      quizId: 'quiz-1',
      selections: [],
      questionCount: 1,
      choiceCount: 3,
      spareCount: 1,
      includeKeySheet: true,
      choiceOrder: { q1: ['Red', 'Green', 'Blue'] },
      createdAt: 0,
    });
    expect(batch.choiceOrder?.q1).toEqual(['Red', 'Green', 'Blue']);
  });

  it('keeps placeholder letters in A-B-C order so each bubble means its own letter', () => {
    expect(
      paperChoiceOrder('batch-1', question('q1', 'C', ['A', 'B', 'D']))
    ).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('buildPaperStubQuiz', () => {
  let n = 0;
  const stub = (
    over: Partial<Parameters<typeof buildPaperStubQuiz>[0]> = {}
  ) => {
    n = 0;
    return buildPaperStubQuiz({
      quizId: 'quiz-1',
      title: 'Unit 3 paper test',
      questionCount: 3,
      choiceCount: 4,
      createdAt: 1000,
      newQuestionId: () => `q${(n += 1)}`,
      ...over,
    });
  };

  it('produces a quiz the editor would accept, with no blank required fields', () => {
    const quiz = stub();
    expect(quiz.questions).toHaveLength(3);
    for (const q of quiz.questions) {
      expect(q.type).toBe('MC');
      expect(q.text.length).toBeGreaterThan(0);
      expect(q.correctAnswer.length).toBeGreaterThan(0);
    }
    expect(analyzePaperQuiz(quiz).exclusions).toEqual([]);
  });

  it('uses the bubble letters as the choices so a key sheet maps straight across', () => {
    const quiz = stub({ choiceCount: 3 });
    expect(quiz.questions[0].correctAnswer).toBe('A');
    expect(quiz.questions[0].incorrectAnswers).toEqual(['B', 'C']);
  });

  it('numbers placeholder text to match the printed rows', () => {
    expect(stub().questions.map((q) => q.text)).toEqual([
      'Question 1',
      'Question 2',
      'Question 3',
    ]);
  });

  it('round-trips through the analyzer at the choice count it was built with', () => {
    expect(analyzePaperQuiz(stub({ choiceCount: 5 })).sheetChoiceCount).toBe(5);
    expect(analyzePaperQuiz(stub({ choiceCount: 2 })).sheetChoiceCount).toBe(2);
  });

  it('falls back to a usable title and clamps an impossible choice count', () => {
    expect(stub({ title: '   ' }).title).toBe('Paper test');
    expect(
      stub({ choiceCount: 42 }).questions[0].incorrectAnswers
    ).toHaveLength(4);
  });

  it('tolerates a zero-question request without producing an invalid question', () => {
    expect(stub({ questionCount: 0 }).questions).toEqual([]);
  });
});
