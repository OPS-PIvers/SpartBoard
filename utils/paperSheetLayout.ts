/**
 * Geometry for printed paper answer sheets, in millimetres from the page's
 * top-left corner. Single source of truth: the printer draws from these
 * numbers and the scan reader recovers bubble positions from them, so the two
 * halves can never drift. See docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §4-§5.
 */

import type { PaperBatch, PaperColumns, PaperGrid } from '@/types';

export type { PaperColumns, PaperGrid };

/** US Letter portrait. Every constant below is millimetres on this page. */
export const PAGE_WIDTH_MM = 215.9;
export const PAGE_HEIGHT_MM = 279.4;

/** Solid corner squares the reader fits an affine transform to (plan Q13). */
export const REGISTRATION_MARK_SIZE_MM = 5;
const REGISTRATION_INSET_MM = 12;

export interface PointMm {
  x: number;
  y: number;
}

export interface RectMm {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mark centres, in the fixed order the reader pairs them up in. */
export const REGISTRATION_MARK_CENTERS_MM: readonly PointMm[] = [
  { x: REGISTRATION_INSET_MM, y: REGISTRATION_INSET_MM },
  { x: PAGE_WIDTH_MM - REGISTRATION_INSET_MM, y: REGISTRATION_INSET_MM },
  { x: REGISTRATION_INSET_MM, y: PAGE_HEIGHT_MM - REGISTRATION_INSET_MM },
  {
    x: PAGE_WIDTH_MM - REGISTRATION_INSET_MM,
    y: PAGE_HEIGHT_MM - REGISTRATION_INSET_MM,
  },
];

export const MARKER_GRID_ROWS = 4;
export const MARKER_GRID_COLS = 15;
/** Total cells; `paperSheetMarker.ts` encodes exactly this many bits. */
export const MARKER_CELL_COUNT = MARKER_GRID_ROWS * MARKER_GRID_COLS;
/** Cell pitch. The ink square is smaller so neighbours never bleed together. */
export const MARKER_CELL_PITCH_MM = 4;
export const MARKER_CELL_SIZE_MM = 3;
/** Top-left of the marker grid, clear of the corner marks and the header. */
export const MARKER_ORIGIN_MM: PointMm = { x: 140, y: 22 };

/** Header band reserved for student name, class, quiz title and page number. */
export const HEADER_RECT_MM: RectMm = { x: 20, y: 20, w: 115, h: 26 };

/** Bottom-centre branding band; clear of the corner windows and the last row. */
export const FOOTER_RECT_MM: RectMm = {
  x: 40,
  y: PAGE_HEIGHT_MM - 13,
  w: PAGE_WIDTH_MM - 80,
  h: 9,
};

export const GRID_TOP_MM = 58;
export const ROW_PITCH_MM = 8;
export const ROWS_PER_COLUMN = 25;
export const COLUMNS_PER_PAGE = 2;
/** Fixed per-page capacity; longer tests continue onto further pages (Q11). */
export const QUESTIONS_PER_PAGE = ROWS_PER_COLUMN * COLUMNS_PER_PAGE;

/** Batches printed before sheet stimuli existed carry no count and are two-column. */
export const DEFAULT_COLUMNS_PER_PAGE: PaperColumns = COLUMNS_PER_PAGE;

/** Question-text layout: each question's stem, then one line per choice with its bubble beside it. */
export const QUESTION_GRID_TOP_MM = 54;
export const QUESTION_ROW_PITCH_MM = 42;
export const QUESTION_ROWS_PER_PAGE = 5;
/** Stem box; stops short of the bottom-right corner search window. */
export const QUESTION_STEM_X_MM = 36;
export const QUESTION_STEM_W_MM = 144;
export const QUESTION_STEM_H_MM = 10.8;
export const QUESTION_CHOICE_TOP_MM = 12;
export const QUESTION_CHOICE_LINE_MM = 6;
/** Bubble x of every choice; clears the bottom-left corner window. */
export const QUESTION_CHOICE_X_MM = 36;
/** Gap between a bubble and its choice text. */
export const QUESTION_CHOICE_TEXT_GAP_MM = 2;

/** The grid a batch printed in. */
export function paperGridOf(
  batch: Pick<PaperBatch, 'columnsPerPage' | 'sheetLayout'>
): PaperGrid {
  return batch.sheetLayout === 'questions'
    ? 'questions'
    : (batch.columnsPerPage ?? DEFAULT_COLUMNS_PER_PAGE);
}

const rowsPerColumn = (grid: PaperGrid): number =>
  grid === 'questions' ? QUESTION_ROWS_PER_PAGE : ROWS_PER_COLUMN;

/** Per-page capacity of a grid. */
export function questionsPerPage(
  columns: PaperGrid = DEFAULT_COLUMNS_PER_PAGE
): number {
  return columns === 'questions'
    ? QUESTION_ROWS_PER_PAGE
    : ROWS_PER_COLUMN * columns;
}

/**
 * Right-half band a single-column sheet prints stimuli in
 * (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D3). `paperSheetLayout.test.ts`
 * proves it clears the left column, the header, the marker grid, the reader's
 * corner search windows and the footer, so moving any of those fails the test.
 */
export const STIMULUS_RECT_MM: RectMm = { x: 84, y: 52, w: 94, h: 204 };

/** Left edge of each answer column's question-number label. */
export const COLUMN_X_MM: readonly number[] = [24, 116];
/** Width of the question-number label before the first bubble. */
export const NUMBER_WIDTH_MM = 12;
export const BUBBLE_PITCH_MM = 8;
export const BUBBLE_DIAMETER_MM = 5;

/** Choice-count bounds a sheet can be printed with (plan Q14). */
export const MIN_CHOICE_COUNT = 2;
export const MAX_CHOICE_COUNT = 5;

/** Choice letters, indexed by choice number. */
export const CHOICE_LETTERS: readonly string[] = ['A', 'B', 'C', 'D', 'E'];

/** Grey the choice letter prints at; the reader's Otsu cut drops it before sampling. */
export const BUBBLE_LETTER_GREY = 0xd0;

/** Safety floor, from rendered-scan measurement (PR #3199). Unit tests pin the margin, not this boundary. */
export const MIN_BUBBLE_LETTER_GREY = 0xc8;

/** Letter point size. Free to tune: binarisation drops the glyph whatever its size. */
export const BUBBLE_LETTER_SIZE_PT = 8;

/** Where cell `index` of the marker grid sits, filled row-major. */
export function markerCellRectMm(index: number): RectMm {
  if (index < 0 || index >= MARKER_CELL_COUNT) {
    throw new RangeError(`marker cell ${index} out of range`);
  }
  const row = Math.floor(index / MARKER_GRID_COLS);
  const col = index % MARKER_GRID_COLS;
  return {
    x: MARKER_ORIGIN_MM.x + col * MARKER_CELL_PITCH_MM,
    y: MARKER_ORIGIN_MM.y + row * MARKER_CELL_PITCH_MM,
    w: MARKER_CELL_SIZE_MM,
    h: MARKER_CELL_SIZE_MM,
  };
}

/** Column/row a page-local question index occupies; columns fill top to bottom. */
export function questionSlotOnPage(
  indexOnPage: number,
  columns: PaperGrid = DEFAULT_COLUMNS_PER_PAGE
): {
  column: number;
  row: number;
} {
  if (indexOnPage < 0 || indexOnPage >= questionsPerPage(columns)) {
    throw new RangeError(`question slot ${indexOnPage} out of range`);
  }
  const rows = rowsPerColumn(columns);
  return {
    column: Math.floor(indexOnPage / rows),
    row: indexOnPage % rows,
  };
}

/** Bounding box of one answer bubble, for both drawing and pixel sampling. */
export function bubbleRectMm(
  indexOnPage: number,
  choiceIndex: number,
  columns: PaperGrid = DEFAULT_COLUMNS_PER_PAGE
): RectMm {
  if (choiceIndex < 0 || choiceIndex >= MAX_CHOICE_COUNT) {
    throw new RangeError(`choice ${choiceIndex} out of range`);
  }
  const { column, row } = questionSlotOnPage(indexOnPage, columns);
  if (columns === 'questions') {
    return {
      x: QUESTION_CHOICE_X_MM,
      y:
        rowTopMm(row, columns) +
        QUESTION_CHOICE_TOP_MM +
        choiceIndex * QUESTION_CHOICE_LINE_MM,
      w: BUBBLE_DIAMETER_MM,
      h: BUBBLE_DIAMETER_MM,
    };
  }
  return {
    x: COLUMN_X_MM[column] + NUMBER_WIDTH_MM + choiceIndex * BUBBLE_PITCH_MM,
    y: rowTopMm(row, columns),
    w: BUBBLE_DIAMETER_MM,
    h: BUBBLE_DIAMETER_MM,
  };
}

/** Rect enclosing a whole answer row, so review can crop exactly what was read. */
export function questionRowRectMm(
  indexOnPage: number,
  choiceCount: number,
  columns: PaperGrid = DEFAULT_COLUMNS_PER_PAGE
): RectMm {
  const { column, row } = questionSlotOnPage(indexOnPage, columns);
  const choices = Math.min(
    Math.max(choiceCount, MIN_CHOICE_COUNT),
    MAX_CHOICE_COUNT
  );
  if (columns === 'questions') {
    // The choices block, text included, so review shows what each bubble meant.
    const first = bubbleRectMm(indexOnPage, 0, columns);
    const last = bubbleRectMm(indexOnPage, choices - 1, columns);
    return {
      x: COLUMN_X_MM[0],
      y: first.y,
      w: QUESTION_STEM_X_MM + QUESTION_STEM_W_MM - COLUMN_X_MM[0],
      h: last.y + last.h - first.y,
    };
  }
  return {
    x: COLUMN_X_MM[column],
    y: rowTopMm(row, columns),
    w: NUMBER_WIDTH_MM + (choices - 1) * BUBBLE_PITCH_MM + BUBBLE_DIAMETER_MM,
    h: BUBBLE_DIAMETER_MM,
  };
}

/** Pages needed for `questionCount` questions; always at least one. */
export function pageCountForQuestions(
  questionCount: number,
  columns: PaperGrid = DEFAULT_COLUMNS_PER_PAGE
): number {
  return Math.max(1, Math.ceil(questionCount / questionsPerPage(columns)));
}

/** Top of row `row` on the page. */
export function rowTopMm(row: number, columns: PaperGrid): number {
  return columns === 'questions'
    ? QUESTION_GRID_TOP_MM + row * QUESTION_ROW_PITCH_MM
    : GRID_TOP_MM + row * ROW_PITCH_MM;
}

/** Box a question's stem prints in on the question-text layout. */
export function questionStemRectMm(indexOnPage: number): RectMm {
  const { row } = questionSlotOnPage(indexOnPage, 'questions');
  return {
    x: QUESTION_STEM_X_MM,
    y: rowTopMm(row, 'questions'),
    w: QUESTION_STEM_W_MM,
    h: QUESTION_STEM_H_MM,
  };
}

/** Box a choice's text prints in, just right of its bubble. */
export function questionChoiceTextRectMm(
  indexOnPage: number,
  choiceIndex: number
): RectMm {
  const b = bubbleRectMm(indexOnPage, choiceIndex, 'questions');
  const x = b.x + b.w + QUESTION_CHOICE_TEXT_GAP_MM;
  return {
    x,
    y: b.y,
    w: QUESTION_STEM_X_MM + QUESTION_STEM_W_MM - x,
    h: b.h,
  };
}
