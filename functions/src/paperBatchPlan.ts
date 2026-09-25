/**
 * Server mirror of `utils/paperSheetPlan.ts` (plan §5.4).
 *
 * `functions/` has `rootDir: "src"`, so the client util cannot be imported —
 * this is a deliberate duplicate. `tests/utils/paperBatchPlanParity.test.ts`
 * imports both and asserts they agree; a silent divergence would mis-seat a
 * whole stack of paper, so edit the two together or that test fails.
 */

import type {
  PaperBoxSize,
  PaperGrid,
  PaperPageItem,
  PaperPageMap,
} from './paperWrittenTypes';

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
  /** Any truthy value marks a recording question, which never prints. */
  recording?: unknown;
  maxWords?: number;
  paperBoxSize?: PaperBoxSize;
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
  /** From `planPaperPages`; stamps the batch layoutVersion 2 so every reader uses the maps. */
  pageMaps?: PaperPageMap[];
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

export interface PaperWrittenPlan {
  questionId: string;
  label: string;
  size: PaperBoxSize;
}

/** One thing the sheet prints, in test order. Mirrors `PaperSheetEntry`. */
export type PaperSheetEntry =
  | { kind: 'mc'; questionId: string; label: string }
  | { kind: 'written'; questionId: string; label: string; size: PaperBoxSize };

export interface PaperQuizAnalysis {
  rows: PaperQuestionPlan[];
  sheetChoiceCount: number;
  shortRows: number[];
  written: PaperWrittenPlan[];
  /** Labels of written questions inside a choose-N section; printing is refused while any remain. */
  writtenRefusals: string[];
  entries: PaperSheetEntry[];
}

export interface AnalyzePaperQuizOptions {
  /** Print free-response questions as handwritten boxes. */
  written?: boolean;
  /** The quiz's raw `sections` and `order`, read tolerantly for choose-N sections. */
  sections?: unknown;
  order?: unknown;
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

/** Mirrors `PAPER_BOX_LINES` / `PAPER_FULL_PAGE_LINES` in `utils/paperWritten.ts`. */
const PAPER_BOX_LINES: Record<Exclude<PaperBoxSize, 'full'>, number> = {
  S: 3,
  M: 6,
  L: 12,
};
const PAPER_FULL_PAGE_LINES = 24;
const PAPER_WORDS_PER_LINE = 10;

const paperBoxLines = (size: PaperBoxSize): number =>
  size === 'full' ? PAPER_FULL_PAGE_LINES : PAPER_BOX_LINES[size];

const isPaperBoxSize = (value: unknown): value is PaperBoxSize =>
  value === 'S' || value === 'M' || value === 'L' || value === 'full';

/** Mirrors `defaultPaperBoxSize` in `utils/paperWritten.ts`. */
export function defaultPaperBoxSize(maxWords?: number): PaperBoxSize {
  if (!maxWords || !Number.isFinite(maxWords) || maxWords <= 0) return 'M';
  const lines = Math.ceil(maxWords / PAPER_WORDS_PER_LINE);
  if (lines <= PAPER_BOX_LINES.S) return 'S';
  if (lines <= PAPER_BOX_LINES.M) return 'M';
  if (lines <= PAPER_BOX_LINES.L) return 'L';
  return 'full';
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Question ids in a choose-N section; mirrors `sessionSectionsFor` + `effectiveChooseCount` with no bank slots. */
function chooseSectionQuestionIds(
  questions: readonly PaperQuestion[],
  sections: unknown,
  order: unknown
): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(sections) || !Array.isArray(order)) return out;
  const counts = new Map<string, number | undefined>();
  for (const raw of sections) {
    if (!isObject(raw) || typeof raw.id !== 'string') continue;
    const count = raw.chooseCount;
    counts.set(
      raw.id,
      typeof count === 'number' && Number.isInteger(count) && count > 0
        ? count
        : undefined
    );
  }
  if (counts.size === 0) return out;
  const questionIds = new Set(questions.map((q) => q.id));
  const claimed = new Set<string>();
  const runs: { count: number | undefined; ids: string[] }[] = [];
  let current: { count: number | undefined; ids: string[] } | null = null;
  for (const entry of order) {
    if (!isObject(entry) || typeof entry.id !== 'string') continue;
    if (entry.kind === 'section') {
      current = counts.has(entry.id)
        ? { count: counts.get(entry.id), ids: [] }
        : null;
      if (current) runs.push(current);
    } else if (entry.kind === 'question') {
      if (!current || claimed.has(entry.id) || !questionIds.has(entry.id))
        continue;
      claimed.add(entry.id);
      current.ids.push(entry.id);
    }
  }
  for (const run of runs) {
    if (run.count !== undefined && run.count < run.ids.length) {
      run.ids.forEach((id) => out.add(id));
    }
  }
  return out;
}

/**
 * The rows a sheet can carry, and with `written` the handwritten boxes.
 * Non-MC questions and bank slots are dropped, exactly as the client analysis
 * drops them — the exclusion labels it also builds are a UI concern and are
 * not mirrored here.
 */
export function analyzePaperQuiz(
  questions: readonly PaperQuestion[],
  options: AnalyzePaperQuizOptions = {}
): PaperQuizAnalysis {
  const rows: PaperQuestionPlan[] = [];
  const written: PaperWrittenPlan[] = [];
  const writtenRefusals: string[] = [];
  const entries: PaperSheetEntry[] = [];
  const chooseIds = options.written
    ? chooseSectionQuestionIds(questions, options.sections, options.order)
    : new Set<string>();
  questions.forEach((question, index) => {
    const label = String(index + 1);
    if (options.written && question.type === 'free-response') {
      if (question.recording) return;
      if (chooseIds.has(question.id)) {
        writtenRefusals.push(
          `${label}. ${question.text || 'Untitled question'}`
        );
        return;
      }
      const size = isPaperBoxSize(question.paperBoxSize)
        ? question.paperBoxSize
        : defaultPaperBoxSize(question.maxWords);
      written.push({ questionId: question.id, label, size });
      entries.push({ kind: 'written', questionId: question.id, label, size });
      return;
    }
    if (question.type !== 'MC') return;
    rows.push({
      row: rows.length + 1,
      questionId: question.id,
      choiceCount: questionChoiceCount(question),
    });
    entries.push({ kind: 'mc', questionId: question.id, label });
  });
  const sheetChoiceCount = rows.length
    ? Math.max(...rows.map((r) => r.choiceCount))
    : MIN_CHOICE_COUNT;
  return {
    rows,
    sheetChoiceCount,
    shortRows: rows
      .filter((r) => r.choiceCount < sheetChoiceCount)
      .map((r) => r.row),
    written,
    writtenRefusals,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Page maps (layoutVersion 2) — mirror of `utils/paperPageMap.ts`
// ---------------------------------------------------------------------------

/** Mirrors `utils/paperSheetLayout.ts`; the parity test fails if any drifts. */
const PAGE_HEIGHT_MM = 279.4;
const CORNER_WINDOW_H_MM = PAGE_HEIGHT_MM * 0.16;
const GRID_TOP_MM = 58;
const ROW_PITCH_MM = 8;
const COLUMN_X_MM: readonly number[] = [24, 116];
const QUESTION_GRID_TOP_MM = 54;
const QUESTION_ROW_PITCH_MM = 42;
const QUESTION_ROWS_PER_PAGE = 5;
const QUESTION_STEM_X_MM = 36;
const QUESTION_STEM_W_MM = 144;
const QUESTION_STEM_H_MM = 10.8;
const QUESTION_CHOICE_TOP_MM = 12;
const WRITTEN_LINE_PITCH_MM = ROW_PITCH_MM;
const WRITTEN_HEADER_ROWS_WITH_STEM = 2;
const WRITTEN_HEADER_ROWS_NUMBER_ONLY = 1;
const WRITTEN_BLOCK_GAP_MM = 3;
const WRITTEN_BOX_X_MM = 38;
const WRITTEN_BOX_W_MM = 140;
const WRITTEN_HEADER_X_MM = 24;
const WRITTEN_ONE_COLUMN_X_MM = 24;
const WRITTEN_ONE_COLUMN_W_MM = 58;
/** Mirrors `MAX_PAGE` in `utils/paperSheetMarker.ts` — 6 page bits. */
export const MAX_PAGE = 63;

export interface PlanPaperPagesInput {
  entries: readonly PaperSheetEntry[];
  grid: PaperGrid;
  stems: boolean;
}

export type PlanPaperPagesResult =
  | { ok: true; pageMaps: PaperPageMap[] }
  | { ok: false; reason: 'too-many-pages'; pageCount: number };

type WrittenItem = Extract<PaperPageItem, { kind: 'written' }>;
type McItem = Extract<PaperPageItem, { kind: 'mc' }>;
type WrittenEntry = Extract<PaperSheetEntry, { kind: 'written' }>;
type McEntry = Extract<PaperSheetEntry, { kind: 'mc' }>;

const ONE_COLUMN_BOX_BOTTOM_MM = PAGE_HEIGHT_MM - CORNER_WINDOW_H_MM;

const headerRows = (stems: boolean): number =>
  stems ? WRITTEN_HEADER_ROWS_WITH_STEM : WRITTEN_HEADER_ROWS_NUMBER_ONLY;

function writtenBlock(
  entry: WrittenEntry,
  top: number,
  lines: number,
  stems: boolean,
  box: { x: number; w: number }
): WrittenItem {
  const headerH = headerRows(stems) * ROW_PITCH_MM - WRITTEN_BLOCK_GAP_MM;
  return {
    kind: 'written',
    questionId: entry.questionId,
    label: entry.label,
    headerMm: {
      x: WRITTEN_HEADER_X_MM,
      y: top,
      w: box.x + box.w - WRITTEN_HEADER_X_MM,
      h: headerH,
    },
    boxMm: {
      x: box.x,
      y: top + headerH,
      w: box.w,
      h: lines * WRITTEN_LINE_PITCH_MM,
    },
    lines,
  };
}

const FULL_WIDTH = { x: WRITTEN_BOX_X_MM, w: WRITTEN_BOX_W_MM };
const ONE_COLUMN = { x: WRITTEN_ONE_COLUMN_X_MM, w: WRITTEN_ONE_COLUMN_W_MM };

const ownsPage = (size: PaperBoxSize, grid: PaperGrid): boolean =>
  size === 'full' || (size === 'L' && grid === 1);

function questionSlotLines(slots: number): number {
  return Math.floor(
    (slots * QUESTION_ROW_PITCH_MM -
      QUESTION_CHOICE_TOP_MM -
      WRITTEN_BLOCK_GAP_MM) /
      WRITTEN_LINE_PITCH_MM
  );
}

function questionSlotsFor(size: Exclude<PaperBoxSize, 'full'>): number {
  const want = paperBoxLines(size);
  let slots = 1;
  while (questionSlotLines(slots) < want) slots += 1;
  return slots;
}

/** Mirror of `planPaperPages` in `utils/paperPageMap.ts`; see it for the layout rules. */
export function planPaperPages(
  input: PlanPaperPagesInput
): PlanPaperPagesResult {
  const { entries, grid, stems } = input;
  const pages: PaperPageItem[][] = [[]];
  let sheetRow = 0;
  let cursor = 0;
  const capacity =
    grid === 'questions' ? QUESTION_ROWS_PER_PAGE : ROWS_PER_COLUMN;
  const current = (): PaperPageItem[] => pages[pages.length - 1];
  const newPage = (): void => {
    pages.push([]);
  };
  const mcItem = (entry: McEntry, originMm: McItem['originMm']): McItem => ({
    kind: 'mc',
    questionId: entry.questionId,
    sheetRow: sheetRow++,
    label: entry.label,
    originMm,
  });
  const placeOwnPage = (entry: WrittenEntry): void => {
    if (current().length > 0) newPage();
    const lines =
      entry.size === 'full' ? PAPER_FULL_PAGE_LINES : paperBoxLines(entry.size);
    current().push(writtenBlock(entry, GRID_TOP_MM, lines, stems, FULL_WIDTH));
    cursor = Number.POSITIVE_INFINITY;
  };
  const ensureRoom = (units: number): void => {
    if (cursor + units > capacity) {
      if (current().length > 0) newPage();
      cursor = 0;
    }
  };

  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];

    if (entry.kind === 'written') {
      i += 1;
      if (ownsPage(entry.size, grid)) {
        placeOwnPage(entry);
        continue;
      }
      const size = entry.size as Exclude<PaperBoxSize, 'full'>;
      if (grid === 'questions') {
        const slots = questionSlotsFor(size);
        ensureRoom(slots);
        const top = QUESTION_GRID_TOP_MM + cursor * QUESTION_ROW_PITCH_MM;
        const lines = questionSlotLines(slots);
        current().push({
          kind: 'written',
          questionId: entry.questionId,
          label: entry.label,
          headerMm: {
            x: WRITTEN_HEADER_X_MM,
            y: top,
            w: QUESTION_STEM_X_MM + QUESTION_STEM_W_MM - WRITTEN_HEADER_X_MM,
            h: QUESTION_STEM_H_MM,
          },
          boxMm: {
            x: WRITTEN_BOX_X_MM,
            y: top + QUESTION_CHOICE_TOP_MM,
            w: WRITTEN_BOX_W_MM,
            h: lines * WRITTEN_LINE_PITCH_MM,
          },
          lines,
        });
        cursor += slots;
        continue;
      }
      const lines = paperBoxLines(size);
      const rows = headerRows(stems) + lines;
      const fits = (at: number): boolean =>
        at + rows <= capacity &&
        (grid !== 1 ||
          GRID_TOP_MM + (at + rows) * ROW_PITCH_MM - WRITTEN_BLOCK_GAP_MM <=
            ONE_COLUMN_BOX_BOTTOM_MM);
      if (!fits(cursor)) {
        if (current().length > 0) newPage();
        cursor = 0;
      }
      current().push(
        writtenBlock(
          entry,
          GRID_TOP_MM + cursor * ROW_PITCH_MM,
          lines,
          stems,
          grid === 1 ? ONE_COLUMN : FULL_WIDTH
        )
      );
      cursor += rows;
      continue;
    }

    let end = i;
    while (end < entries.length && entries[end].kind === 'mc') end += 1;
    const run = entries.slice(i, end) as McEntry[];
    const boxFollows = end < entries.length;
    i = end;

    if (grid === 'questions') {
      for (const mc of run) {
        ensureRoom(1);
        current().push(
          mcItem(mc, {
            x: COLUMN_X_MM[0],
            y: QUESTION_GRID_TOP_MM + cursor * QUESTION_ROW_PITCH_MM,
          })
        );
        cursor += 1;
      }
      continue;
    }

    const columns = grid;
    let at = 0;
    while (at < run.length) {
      ensureRoom(1);
      const rowsLeft = capacity - cursor;
      const chunk = run.slice(at, at + rowsLeft * columns);
      at += chunk.length;
      const tail = at >= run.length;
      const height =
        tail && boxFollows ? Math.ceil(chunk.length / columns) : rowsLeft;
      chunk.forEach((mc, k) => {
        const column = Math.floor(k / height);
        const row = cursor + (k % height);
        current().push(
          mcItem(mc, {
            x: COLUMN_X_MM[column],
            y: GRID_TOP_MM + row * ROW_PITCH_MM,
          })
        );
      });
      cursor += Math.min(height, chunk.length);
      if (!tail) cursor = capacity;
    }
  }

  if (pages.length > MAX_PAGE) {
    return { ok: false, reason: 'too-many-pages', pageCount: pages.length };
  }
  return {
    ok: true,
    pageMaps: pages.map((items, index) => ({ page: index + 1, grid, items })),
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
    pagesPerSheet: input.pageMaps
      ? input.pageMaps.length
      : pageCountForQuestions(input.questionCount, columnsPerPage),
    ...(input.pageMaps
      ? { layoutVersion: 2 as const, pageMaps: input.pageMaps }
      : {}),
    ...(columnsPerPage === DEFAULT_COLUMNS_PER_PAGE ? {} : { columnsPerPage }),
    createdAt: input.createdAt,
  };

  return { batch, sheets };
}
