/**
 * Page maps for sheets that carry handwritten answer boxes (layoutVersion 2).
 * Pure: turns the sheet's entries in test order into where every MC row and
 * written box prints. See docs/plans/QUIZ_PAPER_HANDWRITTEN_RESPONSES.md D9-D16, §3.2.
 */

import type {
  PaperBoxSize,
  PaperGrid,
  PaperPageItem,
  PaperPageMap,
} from '@/types';
import { PAPER_FULL_PAGE_LINES, paperBoxLines } from './paperWritten';
import {
  COLUMN_X_MM,
  CORNER_WINDOW_H_MM,
  GRID_TOP_MM,
  PAGE_HEIGHT_MM,
  QUESTION_CHOICE_TOP_MM,
  QUESTION_GRID_TOP_MM,
  QUESTION_ROW_PITCH_MM,
  QUESTION_ROWS_PER_PAGE,
  QUESTION_STEM_H_MM,
  QUESTION_STEM_W_MM,
  QUESTION_STEM_X_MM,
  ROW_PITCH_MM,
  ROWS_PER_COLUMN,
  STIMULUS_RECT_MM,
  WRITTEN_BLOCK_GAP_MM,
  WRITTEN_BOX_W_MM,
  WRITTEN_BOX_X_MM,
  WRITTEN_HEADER_ROWS_NUMBER_ONLY,
  WRITTEN_HEADER_ROWS_WITH_STEM,
  WRITTEN_HEADER_X_MM,
  WRITTEN_LINE_PITCH_MM,
  WRITTEN_ONE_COLUMN_W_MM,
  WRITTEN_ONE_COLUMN_X_MM,
  type RectMm,
} from './paperSheetLayout';
import { MAX_PAGE } from './paperSheetMarker';

/** One thing the sheet prints, in test order. */
export type PaperSheetEntry =
  | { kind: 'mc'; questionId: string; label: string }
  | { kind: 'written'; questionId: string; label: string; size: PaperBoxSize };

export interface PlanPaperPagesInput {
  entries: readonly PaperSheetEntry[];
  grid: PaperGrid;
  /** Written headers print the stem (quiz sheets); false prints the number only (stubs). */
  stems: boolean;
}

export type PlanPaperPagesResult =
  | { ok: true; pageMaps: PaperPageMap[] }
  | { ok: false; reason: 'too-many-pages'; pageCount: number };

type WrittenItem = Extract<PaperPageItem, { kind: 'written' }>;
type McItem = Extract<PaperPageItem, { kind: 'mc' }>;

/** Lowest y a one-column box may reach: the top of the bottom-left corner window. */
const ONE_COLUMN_BOX_BOTTOM_MM = PAGE_HEIGHT_MM - CORNER_WINDOW_H_MM;

const headerRows = (stems: boolean): number =>
  stems ? WRITTEN_HEADER_ROWS_WITH_STEM : WRITTEN_HEADER_ROWS_NUMBER_ONLY;

/** Header then box, starting at `top`; the block leaves a bubble-sized gap before the next row. */
function writtenBlock(
  entry: Extract<PaperSheetEntry, { kind: 'written' }>,
  top: number,
  lines: number,
  stems: boolean,
  box: { x: number; w: number }
): WrittenItem {
  const headerH = headerRows(stems) * ROW_PITCH_MM - WRITTEN_BLOCK_GAP_MM;
  const headerRight = box.x + box.w;
  return {
    kind: 'written',
    questionId: entry.questionId,
    label: entry.label,
    headerMm: {
      x: WRITTEN_HEADER_X_MM,
      y: top,
      w: headerRight - WRITTEN_HEADER_X_MM,
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

/** A box that gets a page of its own: Full everywhere, and L on one-column sheets (D10). */
const ownsPage = (size: PaperBoxSize, grid: PaperGrid): boolean =>
  size === 'full' || (size === 'L' && grid === 1);

/** Lines a question-text box gets in `slots` whole 42 mm slots; every slot is ruled. */
export function questionSlotLines(slots: number): number {
  return Math.floor(
    (slots * QUESTION_ROW_PITCH_MM -
      QUESTION_CHOICE_TOP_MM -
      WRITTEN_BLOCK_GAP_MM) /
      WRITTEN_LINE_PITCH_MM
  );
}

/** Whole slots a box of `size` needs on the question-text layout. */
export function questionSlotsFor(size: Exclude<PaperBoxSize, 'full'>): number {
  const want = paperBoxLines(size);
  let slots = 1;
  while (questionSlotLines(slots) < want) slots += 1;
  return slots;
}

/**
 * Lay a sheet out page by page (D9-D13). Boxes never split across pages, never
 * enter the corner windows and never overlap the stimulus band. A run of MC rows
 * followed by a box fills a balanced two-column block; a run with nothing after
 * it fills columns top to bottom, so a sheet with no written questions lands
 * exactly where today's arithmetic puts it.
 */
export function planPaperPages(
  input: PlanPaperPagesInput
): PlanPaperPagesResult {
  const { entries, grid, stems } = input;
  const pages: PaperPageItem[][] = [[]];
  let sheetRow = 0;
  // Cursor in grid units: 8 mm rows on plain sheets, 42 mm slots on question-text sheets.
  let cursor = 0;
  const capacity =
    grid === 'questions' ? QUESTION_ROWS_PER_PAGE : ROWS_PER_COLUMN;
  const current = (): PaperPageItem[] => pages[pages.length - 1];
  const newPage = (): void => {
    pages.push([]);
  };
  const mcItem = (
    entry: Extract<PaperSheetEntry, { kind: 'mc' }>,
    originMm: McItem['originMm']
  ): McItem => ({
    kind: 'mc',
    questionId: entry.questionId,
    sheetRow: sheetRow++,
    label: entry.label,
    originMm,
  });
  const placeOwnPage = (
    entry: Extract<PaperSheetEntry, { kind: 'written' }>
  ): void => {
    if (current().length > 0) newPage();
    const lines =
      entry.size === 'full' ? PAPER_FULL_PAGE_LINES : paperBoxLines(entry.size);
    current().push(writtenBlock(entry, GRID_TOP_MM, lines, stems, FULL_WIDTH));
    // Nothing shares a page with it; the next entry starts a fresh one.
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

    // A run of consecutive MC rows.
    let end = i;
    while (end < entries.length && entries[end].kind === 'mc') end += 1;
    const run = entries.slice(i, end) as Extract<
      PaperSheetEntry,
      { kind: 'mc' }
    >[];
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

/** The page carries one box wider than the left column, so no stimulus prints on it (D10). */
export function isStimulusFreePage(map: PaperPageMap): boolean {
  return (
    map.items.length === 1 &&
    map.items[0].kind === 'written' &&
    map.items[0].boxMm.x + map.items[0].boxMm.w > STIMULUS_RECT_MM.x
  );
}

export function mcItemsOf(map: PaperPageMap): McItem[] {
  return map.items.filter((item): item is McItem => item.kind === 'mc');
}

export function writtenItemsOf(map: PaperPageMap): WrittenItem[] {
  return map.items.filter(
    (item): item is WrittenItem => item.kind === 'written'
  );
}

/** Y of each ruled line in a box, top to bottom; a line sits at the bottom of its 8 mm row. */
export function writtenRuleYsMm(
  item: Pick<WrittenItem, 'boxMm' | 'lines'>
): number[] {
  return Array.from(
    { length: item.lines },
    (_, i) => item.boxMm.y + (i + 1) * WRITTEN_LINE_PITCH_MM
  );
}

/** Every rect a page prints for its written items. */
export function writtenRectsOf(map: PaperPageMap): RectMm[] {
  return writtenItemsOf(map).flatMap((w) => [w.headerMm, w.boxMm]);
}
