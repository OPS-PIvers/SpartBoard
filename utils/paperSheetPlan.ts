import { plainPromptText } from './promptMath';
/**
 * Turns a quiz and a roster selection into the sheets to print and the
 * `PaperBatch` that records what was printed.
 *
 * Pure — no Firestore, no DOM. See docs/plans/shipped/QUIZ_PAPER_ANSWER_SHEETS.md §5.
 */

import { promptLabel } from '@/utils/quizPromptText';
import type {
  ClassRoster,
  PaperBatch,
  PaperBatchVersion,
  PaperBoxSize,
  PaperColumns,
  PaperPageMap,
  PaperSeatAssignment,
  QuizData,
  PaperRowGroup,
  QuizQuestion,
  Student,
} from '@/types';
import {
  CHOICE_LETTERS,
  DEFAULT_COLUMNS_PER_PAGE,
  MAX_CHOICE_COUNT,
  MAX_ROW_CHOICES,
  MIN_CHOICE_COUNT,
  pageCountForQuestions,
} from './paperSheetLayout';
import { MAX_SEAT } from './paperSheetMarker';
import type { PaperSheetEntry } from './paperPageMap';
import { paperBoxSizeOf, paperBoxStyleOf } from './paperWritten';
import { rowsFromQuestion } from './quizChoiceRows';
import { multiAnswerOptions } from './quizMultiAnswer';
import { fibBlankCount } from './quizFibBlanks';

/** Small deterministic PRNG so an option set always shuffles the same way. */
export function seededRandom(seed: string): () => number {
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
 * Seeded by the option set alone, so every print of a question (any batch, any
 * teammate's copy) letters it the same way and any test paper matches any
 * sheet; the correct answer is still not always A. True/False keeps True
 * first, as students expect.
 */
export function paperChoiceOrder(
  question: Pick<QuizQuestion, 'correctAnswer' | 'incorrectAnswers'> &
    Partial<Pick<QuizQuestion, 'type' | 'optionOrder' | 'paperOwnTest'>>
): string[] {
  const choices = [
    question.correctAnswer,
    ...(question.incorrectAnswers ?? []),
  ].slice(0, MAX_CHOICE_COUNT);
  // Shuffled letters would print "A. C" and bubble A would mean option C.
  if (isPlaceholderLetterChoices(choices)) {
    return [...choices].sort((a, b) => a.trim().localeCompare(b.trim()));
  }
  // The teacher's own paper already lettered these; a shuffle would misread every bubble.
  if (question.paperOwnTest) {
    return rowsFromQuestion({ type: 'MC', ...question })
      .map((r) => r.text)
      .slice(0, MAX_CHOICE_COUNT);
  }
  if (isTrueFalse(choices)) {
    return [...choices].sort((a) =>
      a.trim().toLowerCase() === 'true' ? -1 : 1
    );
  }
  choices.sort();
  const rand = seededRandom(choices.join('\u0001'));
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
  | 'choose-section'
  | 'too-many-choices';

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
  /** Kept for older callers; written questions in choose-N sections now print, so it stays empty. */
  writtenRefusals: PaperExclusion[];
  /** MC rows and written boxes in test order, numbered by quiz position (D11). */
  entries: PaperSheetEntry[];
  /** Matching, ordering and choose all questions, each printing its own bubble rows; empty unless `groups` is on. */
  groups: PaperGroupPlan[];
}

/** A matching, ordering or choose all question on the sheet. */
export interface PaperGroupPlan extends PaperGroupShape {
  questionId: string;
  label: string;
}

/** The rows a grouped question prints and the bubbles each row has. */
export interface PaperGroupShape {
  group: PaperRowGroup;
  /** Bubble rows: one for choose all, one per term or position otherwise. */
  parts: number;
  /** Bubbles in each row. */
  choices: number;
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
  /** With `written`: fill in the blank prints a write-in line per blank. */
  fib?: boolean;
  /** Matching, ordering and choose all print as bubble rows; the sheet then needs page maps. */
  groups?: boolean;
}

const GROUP_OF: Partial<Record<QuizQuestion['type'], PaperRowGroup>> = {
  MA: 'all',
  Matching: 'match',
  Ordering: 'order',
};

/** Matching pairs in authored order, each split at its first colon. */
export function matchingPairs(correctAnswer: string): [string, string][] {
  return (correctAnswer ?? '')
    .split('|')
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const sep = p.indexOf(':');
      return sep < 0 ? [p, ''] : [p.slice(0, sep), p.slice(sep + 1)];
    });
}

/** Rows and bubbles a matching, ordering or choose all question prints; null when it has nothing to bubble. */
export function paperGroupShape(
  question: Pick<QuizQuestion, 'type' | 'correctAnswer' | 'incorrectAnswers'> &
    Partial<Pick<QuizQuestion, 'matchingDistractors'>>
): PaperGroupShape | null {
  const group = GROUP_OF[question.type];
  if (!group) return null;
  const options = paperGroupOptions(question);
  if (options.length < 2) return null;
  if (group === 'all') return { group, parts: 1, choices: options.length };
  if (group === 'order') {
    return { group, parts: options.length, choices: options.length };
  }
  const terms = matchingPairs(question.correctAnswer).length;
  return terms > 0 ? { group, parts: terms, choices: options.length } : null;
}

/** The options a grouped question letters, in authored order: choose all's options, matching's answers and extras, ordering's items. */
function paperGroupOptions(
  question: Pick<QuizQuestion, 'type' | 'correctAnswer' | 'incorrectAnswers'> &
    Partial<Pick<QuizQuestion, 'matchingDistractors'>>
): string[] {
  const unique = (list: string[]) => [
    ...new Set(list.filter((t) => t.trim().length > 0)),
  ];
  if (question.type === 'MA') return unique(multiAnswerOptions(question));
  if (question.type === 'Ordering') {
    return unique((question.correctAnswer ?? '').split('|'));
  }
  return unique([
    ...matchingPairs(question.correctAnswer).map(([, right]) => right),
    ...(question.matchingDistractors ?? []),
  ]);
}

/**
 * The lettered order a grouped question prints in: seeded by its options, so
 * every print letters it alike. An ordering question never prints already in order.
 */
export function paperGroupOrder(
  question: Pick<QuizQuestion, 'type' | 'correctAnswer' | 'incorrectAnswers'> &
    Partial<Pick<QuizQuestion, 'matchingDistractors'>>
): string[] {
  const options = paperGroupOptions(question);
  const sorted = [...options].sort();
  const rand = seededRandom(`${question.type}\u0001${sorted.join('\u0001')}`);
  const shuffle = (): string[] => {
    const out = [...sorted];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  let order = shuffle();
  if (question.type === 'Ordering') {
    for (
      let tries = 0;
      tries < 8 && order.join('|') === options.join('|');
      tries += 1
    )
      order = shuffle();
    // Two items can only print in one other order.
    if (order.join('|') === options.join('|')) order = [...options].reverse();
  }
  return order;
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
  const groups: PaperGroupPlan[] = [];
  const questions = quiz.questions ?? [];
  const describe = (question: QuizQuestion): string =>
    `${TYPE_LABELS[question.type] ?? question.type}: ${
      plainPromptText(promptLabel(question)) || 'Untitled question'
    }`;

  questions.forEach((question, index) => {
    const label = String(index + 1);
    if (options.written && question.type === 'free-response') {
      if (question.recording) {
        exclusions.push({ reason: 'recording', label: describe(question) });
        return;
      }
      const size = paperBoxSizeOf(question);
      const style = paperBoxStyleOf(question);
      written.push({ questionId: question.id, label, size });
      entries.push({
        kind: 'written',
        questionId: question.id,
        label,
        size,
        ...(style !== 'lines' ? { style } : {}),
      });
      return;
    }
    if (options.written && options.fib && question.type === 'FIB') {
      const blanks = fibBlankCount(question);
      written.push({ questionId: question.id, label, size: blanks });
      entries.push({
        kind: 'written',
        questionId: question.id,
        label,
        size: blanks,
        blanks,
      });
      return;
    }
    if (options.groups && GROUP_OF[question.type]) {
      const shape = paperGroupShape(question);
      if (!shape) {
        exclusions.push({ reason: 'question-type', label: describe(question) });
        return;
      }
      if (shape.choices > MAX_ROW_CHOICES) {
        exclusions.push({
          reason: 'too-many-choices',
          label: describe(question),
        });
        return;
      }
      groups.push({ questionId: question.id, label, ...shape });
      entries.push({ kind: 'mc', questionId: question.id, label, ...shape });
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
    groups,
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
  /** Index into the batch's `versions`; absent when the stack printed one version. */
  versionIndex?: number;
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
  /** Balanced bank-slot versions, dealt in seat order within each class and across the spares (V24). */
  versions?: PaperBatchVersion[];
  /** Deal versions one per sheet across the whole stack (random forms) instead of restarting in each class. */
  dealBySheet?: boolean;
  createdAt: number;
}

/** True when the seat printed an answer key; a versioned stack may print one per version. */
export const isPaperKeySeat = (
  batch: Pick<PaperBatch, 'keySheetSeat' | 'keySheetSeats'>,
  seat: number
): boolean =>
  batch.keySheetSeat === seat || !!batch.keySheetSeats?.includes(seat);

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

  const versionCount = input.versions?.length ?? 0;
  const seatVersions: Record<number, number> = {};
  const dealt = (seat: number, turn: number): { versionIndex?: number } => {
    if (versionCount === 0) return {};
    seatVersions[seat] = turn % versionCount;
    return { versionIndex: seatVersions[seat] };
  };

  let sheetTurn = 0;
  const turnFor = (local: number): number =>
    input.dealBySheet ? sheetTurn++ : local;
  for (const { roster, students } of input.selections) {
    students.forEach((student, local) => {
      const turn = turnFor(local);
      const seat = takeSeat();
      seats[seat] = { rosterId: roster.id, studentId: student.id };
      sheets.push({
        seat,
        student: seats[seat],
        displayName: studentLabel(student),
        className: roster.name,
        isKeySheet: false,
        ...dealt(seat, turn),
      });
    });
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
      ...dealt(seat, turnFor(i)),
    });
  }

  // A stack in versions gets one key per version a sheet printed, each headed with its label.
  const keySheetSeats: number[] = [];
  if (input.includeKeySheet) {
    const used = [...new Set(Object.values(seatVersions))].sort(
      (a, b) => a - b
    );
    for (const k of versionCount > 0 && used.length > 0 ? used : [0]) {
      const seat = takeSeat();
      keySheetSeats.push(seat);
      if (versionCount > 0) seatVersions[seat] = k;
      sheets.push({
        seat,
        student: null,
        displayName: 'ANSWER KEY',
        className: '',
        isKeySheet: true,
        ...(versionCount > 0 ? { versionIndex: k } : {}),
      });
    }
  }
  const keySheetSeat = keySheetSeats[0];

  const choiceOrder: Record<string, string[]> = {};
  for (const q of input.questions ?? []) {
    choiceOrder[q.id] = paperGroupShape(q)
      ? paperGroupOrder(q)
      : paperChoiceOrder(q);
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
    ...(keySheetSeats.length > 1 ? { keySheetSeats } : {}),
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
    ...(versionCount > 0 ? { versions: input.versions, seatVersions } : {}),
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
      paperOwnTest: true,
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
