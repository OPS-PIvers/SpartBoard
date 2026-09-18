/**
 * Turns a quiz and a roster selection into the sheets to print and the
 * `PaperBatch` that records what was printed.
 *
 * Pure — no Firestore, no DOM. See docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §5.
 */

import type {
  ClassRoster,
  PaperBatch,
  PaperSeatAssignment,
  QuizData,
  QuizQuestion,
  Student,
} from '@/types';
import {
  CHOICE_LETTERS,
  MAX_CHOICE_COUNT,
  MIN_CHOICE_COUNT,
  pageCountForQuestions,
} from './paperSheetLayout';
import { MAX_SEAT } from './paperSheetMarker';

/** One printable answer row, in sheet order. */
export interface PaperQuestionPlan {
  /** 1-based row number printed beside the bubbles. */
  row: number;
  questionId: string;
  /** Choices this question actually has; may be fewer than the sheet prints. */
  choiceCount: number;
}

export type PaperExclusionReason = 'question-type' | 'bank-slot';

/** A question the teacher authored that cannot be answered on paper (plan Q5). */
export interface PaperExclusion {
  reason: PaperExclusionReason;
  label: string;
}

export interface PaperQuizAnalysis {
  rows: PaperQuestionPlan[];
  exclusions: PaperExclusion[];
  /** Bubbles printed on every row — the largest any question needs (plan Q14). */
  sheetChoiceCount: number;
  /** Rows printing more bubbles than their question has, named at print time. */
  shortRows: number[];
}

const clampChoices = (n: number): number =>
  Math.min(Math.max(n, MIN_CHOICE_COUNT), MAX_CHOICE_COUNT);

/** Choices an MC question offers, capped at what a sheet can print. */
function questionChoiceCount(question: QuizQuestion): number {
  return clampChoices(1 + (question.incorrectAnswers?.length ?? 0));
}

const TYPE_LABELS: Record<string, string> = {
  FIB: 'Fill in the blank',
  Matching: 'Matching',
  Ordering: 'Ordering',
  'free-response': 'Free response',
};

/**
 * Split a quiz into the rows a sheet can carry and the questions it cannot.
 *
 * Bank slots are excluded alongside the non-MC types: a slot draws a different
 * question per student, so one shared answer key could not grade the stack.
 */
export function analyzePaperQuiz(quiz: QuizData): PaperQuizAnalysis {
  const rows: PaperQuestionPlan[] = [];
  const exclusions: PaperExclusion[] = [];

  for (const question of quiz.questions ?? []) {
    if (question.type !== 'MC') {
      exclusions.push({
        reason: 'question-type',
        label: `${TYPE_LABELS[question.type] ?? question.type}: ${
          question.text || 'Untitled question'
        }`,
      });
      continue;
    }
    rows.push({
      row: rows.length + 1,
      questionId: question.id,
      choiceCount: questionChoiceCount(question),
    });
  }

  for (const slot of quiz.bankSlots ?? []) {
    const drawn =
      slot.mode === 'random'
        ? `${slot.count ?? 0} drawn at random`
        : `${slot.questionIds?.length ?? 0} selected`;
    exclusions.push({
      reason: 'bank-slot',
      label: `Question bank "${slot.bankTitle}" (${drawn})`,
    });
  }

  const sheetChoiceCount = rows.length
    ? Math.max(...rows.map((r) => r.choiceCount))
    : MIN_CHOICE_COUNT;

  return {
    rows,
    exclusions,
    sheetChoiceCount,
    shortRows: rows
      .filter((r) => r.choiceCount < sheetChoiceCount)
      .map((r) => r.row),
  };
}

/** One sheet to print, resolved far enough to render a header. */
export interface PaperSheetPlan {
  seat: number;
  /** Absent on spares and on the answer key. */
  student: PaperSeatAssignment | null;
  /** Header line; "Name ______" for a spare, "ANSWER KEY" for the key sheet. */
  displayName: string;
  className: string;
  isKeySheet: boolean;
}

export interface PaperBatchSelection {
  roster: ClassRoster;
  /** Students to print for, in roster order. */
  students: Student[];
}

export interface PaperBatchInput {
  batchId: string;
  quizId: string;
  selections: PaperBatchSelection[];
  questionCount: number;
  choiceCount: number;
  /** Unassigned sheets for walk-ins (plan Q15). */
  spareCount: number;
  /** Include a bubbled ANSWER KEY sheet in the stack (plan Q16). */
  includeKeySheet: boolean;
  createdAt: number;
}

export interface PaperBatchPlan {
  batch: PaperBatch;
  sheets: PaperSheetPlan[];
}

const studentLabel = (s: Student): string =>
  [s.lastName, s.firstName].filter(Boolean).join(', ') || 'Unnamed student';

/**
 * Allocate seats and build the batch record.
 *
 * Spares and the key sheet get real seat numbers too, so every printed sheet
 * carries a marker no other sheet carries — which is what makes re-importing a
 * stack idempotent (plan Q23). What a seat *means* is the batch's job: absent
 * from `seats` and present in `spareSeats` is a walk-in, and `keySheetSeat` is
 * the key.
 */
export function planPaperBatch(input: PaperBatchInput): PaperBatchPlan {
  const sheets: PaperSheetPlan[] = [];
  const seats: Record<number, PaperSeatAssignment> = {};
  const spareSeats: number[] = [];
  let nextSeat = 1;

  const takeSeat = (): number => {
    if (nextSeat > MAX_SEAT) {
      throw new RangeError(
        `A print run holds at most ${MAX_SEAT} sheets; split it across batches.`
      );
    }
    const seat = nextSeat;
    nextSeat += 1;
    return seat;
  };

  for (const { roster, students } of input.selections) {
    for (const student of students) {
      const seat = takeSeat();
      seats[seat] = { rosterId: roster.id, studentId: student.id };
      sheets.push({
        seat,
        student: seats[seat],
        displayName: studentLabel(student),
        className: roster.name,
        isKeySheet: false,
      });
    }
  }

  for (let i = 0; i < Math.max(0, input.spareCount); i += 1) {
    const seat = takeSeat();
    spareSeats.push(seat);
    sheets.push({
      seat,
      student: null,
      displayName: 'Name ______________________',
      className: '',
      isKeySheet: false,
    });
  }

  let keySheetSeat: number | undefined;
  if (input.includeKeySheet) {
    keySheetSeat = takeSeat();
    sheets.push({
      seat: keySheetSeat,
      student: null,
      displayName: 'ANSWER KEY',
      className: '',
      isKeySheet: true,
    });
  }

  const batch: PaperBatch = {
    id: input.batchId,
    quizId: input.quizId,
    rosterIds: [...new Set(input.selections.map((s) => s.roster.id))],
    questionCount: input.questionCount,
    choiceCount: clampChoices(input.choiceCount),
    seats,
    spareSeats,
    ...(keySheetSeat !== undefined ? { keySheetSeat } : {}),
    pagesPerSheet: pageCountForQuestions(input.questionCount),
    createdAt: input.createdAt,
  };

  return { batch, sheets };
}

export interface PaperStubQuizInput {
  quizId: string;
  title: string;
  questionCount: number;
  choiceCount: number;
  createdAt: number;
  /** Injectable for deterministic tests. */
  newQuestionId?: () => string;
}

/**
 * Build the quiz behind a paper-only test (plan Q30).
 *
 * Every question is a valid MC question from birth — placeholder text and a
 * placeholder key — so nothing downstream has to special-case a stub. The
 * choices are the bubble letters themselves, which is what lets the bubbled
 * ANSWER KEY sheet overwrite `correctAnswer` with the letter a teacher filled
 * in, with no translation step.
 */
export function buildPaperStubQuiz(input: PaperStubQuizInput): QuizData {
  const choices = clampChoices(input.choiceCount);
  const newId = input.newQuestionId ?? (() => crypto.randomUUID());
  const letters = CHOICE_LETTERS.slice(0, choices);
  const questions: QuizQuestion[] = Array.from(
    { length: Math.max(0, input.questionCount) },
    (_, i) => ({
      id: newId(),
      timeLimit: 0,
      text: `Question ${i + 1}`,
      type: 'MC' as const,
      correctAnswer: letters[0],
      incorrectAnswers: letters.slice(1),
      points: 1,
    })
  );
  return {
    id: input.quizId,
    title: input.title.trim() || 'Paper test',
    questions,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}
