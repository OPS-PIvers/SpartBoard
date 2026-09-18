/**
 * Geometry for printed paper answer sheets, in millimetres from the page's
 * top-left corner. Single source of truth: the printer draws from these
 * numbers and the scan reader recovers bubble positions from them, so the two
 * halves can never drift. See docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §4-§5.
 */

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

export const GRID_TOP_MM = 58;
export const ROW_PITCH_MM = 8;
export const ROWS_PER_COLUMN = 25;
export const COLUMNS_PER_PAGE = 2;
/** Fixed per-page capacity; longer tests continue onto further pages (Q11). */
export const QUESTIONS_PER_PAGE = ROWS_PER_COLUMN * COLUMNS_PER_PAGE;

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
export function questionSlotOnPage(indexOnPage: number): {
  column: number;
  row: number;
} {
  if (indexOnPage < 0 || indexOnPage >= QUESTIONS_PER_PAGE) {
    throw new RangeError(`question slot ${indexOnPage} out of range`);
  }
  return {
    column: Math.floor(indexOnPage / ROWS_PER_COLUMN),
    row: indexOnPage % ROWS_PER_COLUMN,
  };
}

/** Bounding box of one answer bubble, for both drawing and pixel sampling. */
export function bubbleRectMm(indexOnPage: number, choiceIndex: number): RectMm {
  if (choiceIndex < 0 || choiceIndex >= MAX_CHOICE_COUNT) {
    throw new RangeError(`choice ${choiceIndex} out of range`);
  }
  const { column, row } = questionSlotOnPage(indexOnPage);
  return {
    x: COLUMN_X_MM[column] + NUMBER_WIDTH_MM + choiceIndex * BUBBLE_PITCH_MM,
    y: GRID_TOP_MM + row * ROW_PITCH_MM,
    w: BUBBLE_DIAMETER_MM,
    h: BUBBLE_DIAMETER_MM,
  };
}

/** Rect enclosing a whole answer row, so review can crop exactly what was read. */
export function questionRowRectMm(
  indexOnPage: number,
  choiceCount: number
): RectMm {
  const { column, row } = questionSlotOnPage(indexOnPage);
  const choices = Math.min(
    Math.max(choiceCount, MIN_CHOICE_COUNT),
    MAX_CHOICE_COUNT
  );
  return {
    x: COLUMN_X_MM[column],
    y: GRID_TOP_MM + row * ROW_PITCH_MM,
    w: NUMBER_WIDTH_MM + (choices - 1) * BUBBLE_PITCH_MM + BUBBLE_DIAMETER_MM,
    h: BUBBLE_DIAMETER_MM,
  };
}

/** Pages needed for `questionCount` questions; always at least one. */
export function pageCountForQuestions(questionCount: number): number {
  return Math.max(1, Math.ceil(questionCount / QUESTIONS_PER_PAGE));
}
