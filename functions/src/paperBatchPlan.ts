/**
 * Server mirror of `utils/paperSheetPlan.ts` (plan §5.4).
 *
 * `functions/` has `rootDir: "src"`, so the client util cannot be imported —
 * this is a deliberate duplicate. `tests/utils/paperBatchPlanParity.test.ts`
 * imports both and asserts they agree; a silent divergence would mis-seat a
 * whole stack of paper, so edit the two together or that test fails.
 */

import type { PaperPageMap } from './paperWrittenTypes';

/** Mirrors `PaperColumns` in `types.ts`. */
export type PaperColumns = 1 | 2;

/** Mirrors `ROWS_PER_COLUMN` in `utils/paperSheetLayout.ts`. */
const ROWS_PER_COLUMN = 25;
/** Mirrors `DEFAULT_COLUMNS_PER_PAGE`; a batch without the field is two-column. */
const DEFAULT_COLUMNS_PER_PAGE: PaperColumns = 2;

export const MIN_CHOICE_COUNT = 2;
export const MAX_CHOICE_COUNT = 5;
/** Mirrors `MAX_SEAT` in `utils/paperSheetMarker.ts` — 10 seat bits. */
export const MAX_SEAT = 1023;

export interface PaperQuestion {
  id: string;
  type: string;
  text?: string;
  correctAnswer: string;
  incorrectAnswers?: string[];
}

export interface PaperSeatAssignment {
  rosterId: string;
  studentId: string;
}

export interface PaperBatchStudent {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PaperBatchRoster {
  id: string;
  name: string;
}

export interface PaperBatchSelection {
  roster: PaperBatchRoster;
  students: PaperBatchStudent[];
}

export interface PaperSheetPlan {
  seat: number;
  student: PaperSeatAssignment | null;
  displayName: string;
  className: string;
  isKeySheet: boolean;
}

export interface PaperBatchDoc {
  id: string;
  quizId: string;
  rosterIds: string[];
  questionCount: number;
  choiceCount: number;
  seats: Record<number, PaperSeatAssignment>;
  spareSeats: number[];
  keySheetSeat?: number;
  choiceOrder?: Record<string, string[]>;
  pagesPerSheet: number;
  columnsPerPage?: PaperColumns;
  layoutVersion?: 2;
  pageMaps?: PaperPageMap[];
  createdAt: number;
}

export interface PaperBatchInput {
  batchId: string;
  quizId: string;
  selections: PaperBatchSelection[];
  questionCount: number;
  choiceCount: number;
  spareCount: number;
  includeKeySheet: boolean;
  questions?: readonly PaperQuestion[];
  columnsPerPage?: PaperColumns;
  createdAt: number;
}

export interface PaperBatchPlan {
  batch: PaperBatchDoc;
  sheets: PaperSheetPlan[];
}

export interface PaperQuestionPlan {
  row: number;
  questionId: string;
  choiceCount: number;
}

export interface PaperQuizAnalysis {
  rows: PaperQuestionPlan[];
  sheetChoiceCount: number;
  shortRows: number[];
}

const questionsPerPage = (
  columns: PaperColumns = DEFAULT_COLUMNS_PER_PAGE
): number => ROWS_PER_COLUMN * columns;

const pageCountForQuestions = (
  questionCount: number,
  columns: PaperColumns = DEFAULT_COLUMNS_PER_PAGE
): number => Math.max(1, Math.ceil(questionCount / questionsPerPage(columns)));

const clampChoices = (n: number): number =>
  Math.min(Math.max(n, MIN_CHOICE_COUNT), MAX_CHOICE_COUNT);

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

/** Mirrors `CHOICE_LETTERS` in `utils/paperSheetLayout.ts`. */
const PLACEHOLDER_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** True when the options are only the bare letters a paper stub writes, in any order. */
export const isPlaceholderLetterChoices = (
  choices: readonly string[]
): boolean =>
  choices.length > 0 &&
  choices
    .map((c) => c.trim())
    .sort()
    .join('|') === PLACEHOLDER_LETTERS.slice(0, choices.length).join('|');

/** The lettered order a question's options print in on the test paper. */
export function paperChoiceOrder(
  batchId: string,
  question: PaperQuestion
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

const questionChoiceCount = (question: PaperQuestion): number =>
  clampChoices(1 + (question.incorrectAnswers?.length ?? 0));

/**
 * The rows a sheet can carry. Non-MC questions and bank slots are dropped,
 * exactly as the client analysis drops them — the exclusion labels it also
 * builds are a UI concern and are not mirrored here.
 */
export function analyzePaperQuiz(
  questions: readonly PaperQuestion[]
): PaperQuizAnalysis {
  const rows: PaperQuestionPlan[] = [];
  for (const question of questions) {
    if (question.type !== 'MC') continue;
    rows.push({
      row: rows.length + 1,
      questionId: question.id,
      choiceCount: questionChoiceCount(question),
    });
  }
  const sheetChoiceCount = rows.length
    ? Math.max(...rows.map((r) => r.choiceCount))
    : MIN_CHOICE_COUNT;
  return {
    rows,
    sheetChoiceCount,
    shortRows: rows
      .filter((r) => r.choiceCount < sheetChoiceCount)
      .map((r) => r.row),
  };
}

const studentLabel = (s: PaperBatchStudent): string =>
  [s.lastName, s.firstName].filter(Boolean).join(', ') || 'Unnamed student';

/** Allocate seats and build the batch record. */
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

  const batch: PaperBatchDoc = {
    id: input.batchId,
    quizId: input.quizId,
    rosterIds: [...new Set(input.selections.map((s) => s.roster.id))],
    questionCount: input.questionCount,
    choiceCount: clampChoices(input.choiceCount),
    seats,
    spareSeats,
    ...(keySheetSeat !== undefined ? { keySheetSeat } : {}),
    ...(input.questions?.length ? { choiceOrder } : {}),
    pagesPerSheet: pageCountForQuestions(input.questionCount, columnsPerPage),
    ...(columnsPerPage === DEFAULT_COLUMNS_PER_PAGE ? {} : { columnsPerPage }),
    createdAt: input.createdAt,
  };

  return { batch, sheets };
}
