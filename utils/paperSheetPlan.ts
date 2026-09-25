/**
 * Turns a quiz and a roster selection into the sheets to print and the
 * `PaperBatch` that records what was printed.
 *
 * Pure — no Firestore, no DOM. See docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §5.
 */

import type {
  ClassRoster,
  PaperBatch,
  PaperBoxSize,
  PaperColumns,
  PaperPageMap,
  PaperSeatAssignment,
  QuizData,
  QuizQuestion,
  Student,
} from '@/types';
import {
  CHOICE_LETTERS,
  DEFAULT_COLUMNS_PER_PAGE,
  MAX_CHOICE_COUNT,
  MIN_CHOICE_COUNT,
  pageCountForQuestions,
} from './paperSheetLayout';
import { MAX_SEAT } from './paperSheetMarker';
import type { PaperSheetEntry } from './paperPageMap';
import { defaultPaperBoxSize } from './paperWritten';
import { effectiveChooseCount, sessionSectionsFor } from './quizSections';

/** Small deterministic PRNG so a batch always shuffles the same way. */
function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isTrueFalse = (choices: readonly string[]): boolean =>
  choices.length === 2 &&
  choices
    .map((c) => c.trim().toLowerCase())
    .sort()
    .join('|') === 'false|true';

/** True when the options are only the bare letters a paper stub writes, in any order. */
export const isPlaceholderLetterChoices = (
  choices: readonly string[]
): boolean =>
  choices.length > 0 &&
  choices
    .map((c) => c.trim())
    .sort()
    .join('|') === CHOICE_LETTERS.slice(0, choices.length).join('|');

/**
 * The lettered order a question's options print in on the test paper.
 *
 * Seeded by batch and question so the same batch always prints the same paper
 * and the correct answer is not always A. True/False keeps True first, as
 * students expect.
 */
export function paperChoiceOrder(
  batchId: string,
  question: QuizQuestion
): string[] {
  const choices = [
    question.correctAnswer,
    ...(question.incorrectAnswers ?? []),
  ].slice(0, MAX_CHOICE_COUNT);
  if (isTrueFalse(choices)) {
    return [...choices].sort((a) =>
      a.trim().toLowerCase() === 'true' ? -1 : 1
    );
  }
  // Shuffled letters would print "A. C" and bubble A would mean option C.
  if (isPlaceholderLetterChoices(choices)) {
    return [...choices].sort((a, b) => a.trim().localeCompare(b.trim()));
  }
  const rand = seededRandom(`${batchId}:${question.id}`);
  for (let i = choices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

/** One printable answer row, in sheet order. */
export interface PaperQuestionPlan {
  /** 1-based row number printed beside the bubbles. */
  row: number;
  questionId: string;
  /** Choices this question actually has; may be fewer than the sheet prints. */
  choiceCount: number;
  /** The imported test's own number for this question, printed small beside `row`. */
  sourceLabel?: string;
}

export type PaperExclusionReason =
  | 'question-type'
  | 'bank-slot'
  | 'recording'
  | 'choose-section';

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
  /** Free-response questions printed as handwritten boxes; empty unless `written` is on. */
  written: PaperWrittenPlan[];
  /** Written questions inside a choose-N section; printing is refused while any remain (D3). */
  writtenRefusals: PaperExclusion[];
  /** MC rows and written boxes in test order, numbered by quiz position (D11). */
  entries: PaperSheetEntry[];
}

export interface PaperWrittenPlan {
  questionId: string;
  /** Printed number: the question's position in the quiz. */
  label: string;
  size: PaperBoxSize;
}

export interface AnalyzePaperQuizOptions {
  /** Print free-response questions as handwritten boxes (`paper-handwritten-responses`). */
  written?: boolean;
}

/** Nothing to print from the quiz itself, so the teacher builds a stub. */
export function isPaperStubAnalysis(
  analysis: Pick<PaperQuizAnalysis, 'rows' | 'written'>
): boolean {
  return analysis.rows.length === 0 && analysis.written.length === 0;
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
  MA: 'Choose all that apply',
  'free-response': 'Free response',
};

/**
 * Split a quiz into the rows a sheet can carry and the questions it cannot.
 *
 * Bank slots are excluded alongside the non-MC types: a slot draws a different
 * question per student, so one shared answer key could not grade the stack.
 */
export function analyzePaperQuiz(
  quiz: QuizData,
  options: AnalyzePaperQuizOptions = {}
): PaperQuizAnalysis {
  const rows: PaperQuestionPlan[] = [];
  const exclusions: PaperExclusion[] = [];
  const written: PaperWrittenPlan[] = [];
  const writtenRefusals: PaperExclusion[] = [];
  const entries: PaperSheetEntry[] = [];
  const questions = quiz.questions ?? [];
  const chooseSectionIds = new Set(
    options.written
      ? sessionSectionsFor({ ...quiz, questions })
          .filter((s) => effectiveChooseCount(s) !== undefined)
          .flatMap((s) => s.questionIds)
      : []
  );
  const describe = (question: QuizQuestion): string =>
    `${TYPE_LABELS[question.type] ?? question.type}: ${
      question.text || 'Untitled question'
    }`;

  questions.forEach((question, index) => {
    const label = String(index + 1);
    if (options.written && question.type === 'free-response') {
      if (question.recording) {
        exclusions.push({ reason: 'recording', label: describe(question) });
        return;
      }
      if (chooseSectionIds.has(question.id)) {
        writtenRefusals.push({
          reason: 'choose-section',
          label: `${label}. ${question.text || 'Untitled question'}`,
        });
        return;
      }
      const size =
        question.paperBoxSize ?? defaultPaperBoxSize(question.maxWords);
      written.push({ questionId: question.id, label, size });
      entries.push({ kind: 'written', questionId: question.id, label, size });
      return;
    }
    if (question.type !== 'MC') {
      exclusions.push({ reason: 'question-type', label: describe(question) });
      return;
    }
    rows.push({
      row: rows.length + 1,
      questionId: question.id,
      choiceCount: questionChoiceCount(question),
      ...(question.sourceLabel ? { sourceLabel: question.sourceLabel } : {}),
    });
    entries.push({ kind: 'mc', questionId: question.id, label });
  });

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
    written,
    writtenRefusals,
    entries,
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
  /** The authored MC questions in sheet order; absent for a stub. */
  questions?: readonly QuizQuestion[];
  /**
   * Option text per question id in the order the paper already prints it,
   * for a test SpartBoard did not lay out. Used as given — the shuffle
   * `questions` would apply would not match the paper in the teacher's hand.
   */
  choiceOrder?: Readonly<Record<string, readonly string[]>>;
  /** Answer columns each page prints; absent = 2 (D1). */
  columnsPerPage?: PaperColumns;
  /** Print each row's question text beside its bubbles; overrides `columnsPerPage`. */
  sheetLayout?: 'questions';
  /** From `planPaperPages`; stamps the batch layoutVersion 2 so every reader uses the maps. */
  pageMaps?: PaperPageMap[];
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
  const columnsPerPage = input.columnsPerPage ?? DEFAULT_COLUMNS_PER_PAGE;
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

  const choiceOrder: Record<string, string[]> = {};
  for (const q of input.questions ?? []) {
    choiceOrder[q.id] = paperChoiceOrder(input.batchId, q);
  }
  for (const [id, options] of Object.entries(input.choiceOrder ?? {})) {
    choiceOrder[id] = [...options];
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
    ...(Object.keys(choiceOrder).length > 0 ? { choiceOrder } : {}),
    pagesPerSheet: input.pageMaps
      ? input.pageMaps.length
      : pageCountForQuestions(
          input.questionCount,
          input.sheetLayout ?? columnsPerPage
        ),
    ...(input.pageMaps
      ? { layoutVersion: 2 as const, pageMaps: input.pageMaps }
      : {}),
    ...(input.sheetLayout ? { sheetLayout: input.sheetLayout } : {}),
    // Written only when it is not the default, so a batch printed without sheet
    // stimuli is the same document it was before this field existed.
    ...(columnsPerPage === DEFAULT_COLUMNS_PER_PAGE ? {} : { columnsPerPage }),
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
