// Results print on the student's kept scan page (docs/plans/shipped/QUIZ_PAPER_KEPT_PAGES.md §3.2, K8, K9, K10, K20).
import type {
  PaperGrid,
  PaperImageMarkup,
  PaperMarkupItem,
  PaperPageMap,
} from '@/types';
import {
  MARKER_CELL_COUNT,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  PT_CHAR_MM,
  QUESTION_CHOICE_TOP_MM,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  BUBBLE_DIAMETER_MM,
  bubbleRectAtOriginMm,
  markerCellRectMm,
  mcRowOriginMm,
  questionsPerPage,
  type PointMm,
  type RectMm,
} from './paperSheetLayout';
import { mcItemsOf, writtenItemsOf } from './paperPageMap';
import {
  FULL_PAGE_VIEWPORT_MM,
  PAPER_STAMP_GLYPHS,
  markupCommentRows,
  markupNumberChipHtml,
  renderPaperMarkupAnswers,
} from './paperMarkupRender';
import { escapeHtml } from './printHtmlDocument';
import type { SheetFill } from './paperSheetPrint';
import type { QuizResultsPrintOptions } from './quizStudentReportPrint';

/** Where things sit on the printed page; the same geometry the redrawn sheet uses. */
export interface ScanSheetGeometry {
  batchId: string;
  seat: number;
  /** MC rows on the whole sheet; `SheetFill` arrays are indexed by sheet row. */
  questionCount: number;
  choiceCount: number;
  columnsPerPage: PaperGrid;
  /** This printed page's map, in the batch's own page numbering (prompt pages counted); absent before layoutVersion 2. */
  pageMap?: PaperPageMap;
}

/** One kept page to print with the report options drawn on top. */
export interface ScanSheetPageInput {
  /** The straightened page as a data URL, 215.9 × 279.4 mm at 150 dpi. */
  pageSrc: string;
  /** Printed sheet page number, as in the artifact id `pg_{scanId}_{page}`. */
  page: number;
  geometry: ScanSheetGeometry;
  /** Margin marks and key rings per sheet row, plus points and comment per written box (from `sheetFillFor`). */
  fill: SheetFill;
  /** Image markup by question id; only answers whose box is on this page draw. */
  markup?: Readonly<Record<string, PaperImageMarkup>>;
  options: Pick<
    QuizResultsPrintOptions,
    | 'markAnswers'
    | 'keyMode'
    | 'questionScope'
    | 'showScore'
    | 'showWrittenFeedback'
  >;
  /** The report prints after the sheet, so cut-off comments point to it. */
  reportFollows?: boolean;
}

/** Edge strip a printer that is not borderless may clip; nothing drawn on top lands in it. */
export const SCAN_SAFE_MARGIN_MM = 6.35;

/** How far each white patch reaches past what it hides, to cover a straightening error. */
const PATCH_PAD_MARKER_MM = 2;
const PATCH_PAD_REG_MM = 2.5;

/** White patches over the marker grid and the four registration squares, so the print can't be imported (K20). */
export function scanSheetPatchRectsMm(): RectMm[] {
  const first = markerCellRectMm(0);
  const last = markerCellRectMm(MARKER_CELL_COUNT - 1);
  const marker: RectMm = {
    x: first.x - PATCH_PAD_MARKER_MM,
    y: first.y - PATCH_PAD_MARKER_MM,
    w: last.x + last.w - first.x + PATCH_PAD_MARKER_MM * 2,
    h: last.y + last.h - first.y + PATCH_PAD_MARKER_MM * 2,
  };
  const half = REGISTRATION_MARK_SIZE_MM / 2 + PATCH_PAD_REG_MM;
  return [
    marker,
    ...REGISTRATION_MARK_CENTERS_MM.map((c) => ({
      x: c.x - half,
      y: c.y - half,
      w: half * 2,
      h: half * 2,
    })),
  ];
}

/** Margin check or X size, and its gap left of the question number cell. */
const MARK_MM = 3.8;
const MARK_GAP_MM = 2.6;
const MARK_STROKE_MM = 0.55;
const MARK_INK = { correct: '#166534', incorrect: '#b91c1c', unclear: '#000' };
const MARK_GLYPH = {
  correct: PAPER_STAMP_GLYPHS.check.d,
  incorrect: PAPER_STAMP_GLYPHS.x.d,
  unclear: PAPER_STAMP_GLYPHS.question.d,
} as const;

/** Key ring ink: a printed blue that reads dark gray in black and white, unlike pencil. */
const KEY_INK = '#1d4ed8';
const KEY_STROKE_MM = 0.45;
/** Clear of a filled bubble's pencil, and 1 mm short of the question number beside bubble A. */
const KEY_RINGS_MM = [3.3];
/** The question-text grid stacks choices 6 mm apart: a tighter ring and a pointer. */
const KEY_RING_TIGHT_MM = 3.05;

/** Feedback column in the right margin beside each written box. */
const FEEDBACK_X_MM = 181.5;
const FEEDBACK_RIGHT_MM = PAGE_WIDTH_MM - SCAN_SAFE_MARGIN_MM - 0.2;
/** Lowest the column may reach: above the bottom-right patch. */
const FEEDBACK_BOTTOM_MM =
  REGISTRATION_MARK_CENTERS_MM[3].y -
  REGISTRATION_MARK_SIZE_MM / 2 -
  PATCH_PAD_REG_MM -
  1.5;
const POINTS_PT = 11;
const POINTS_LINE_MM = 4.8;
const NOTE_PT = 10;
const NOTE_LINE_MM = 4.2;
/** Width a number chip takes before its comment. */
const CHIP_MM = 5.4;

/** The score sits in the patched marker area, which is clear by construction. */
const SCORE_PT = 10;

const mm = (n: number): string => `${n.toFixed(3)}mm`;
const num = (n: number): string => String(Math.round(n * 1000) / 1000 + 0);

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Greedy word wrap at Arial's rough width, deliberately a little wide. */
function wrapLines(text: string, widthMm: number, pt: number): number {
  const char = pt * PT_CHAR_MM;
  let lines = 1;
  let used = 0;
  for (const w of words(text)) {
    const need = w.length * char;
    if (used > 0 && used + need > widthMm) {
      lines += Math.max(1, Math.ceil(need / widthMm));
      used = Math.min(need, widthMm);
    } else {
      used += need;
    }
    used += char;
  }
  return lines;
}

/** `text` cut at a word with an ellipsis until it wraps into `lines`. */
function cutToLines(
  text: string,
  widthMm: number,
  pt: number,
  lines: number
): string {
  if (wrapLines(text, widthMm, pt) <= lines) return text;
  const w = words(text);
  while (w.length > 1) {
    w.pop();
    const t = `${w.join(' ')}…`;
    if (wrapLines(t, widthMm, pt) <= lines) return t;
  }
  const chars = Math.max(
    1,
    Math.floor((widthMm * lines) / (pt * PT_CHAR_MM)) - 1
  );
  return `${text.slice(0, chars)}…`;
}

interface Row {
  sheetRow: number;
  origin: PointMm;
}

function rowsOnPage(input: ScanSheetPageInput): {
  rows: Row[];
  grid: PaperGrid;
} {
  const { geometry, page } = input;
  if (geometry.pageMap) {
    return {
      grid: geometry.pageMap.grid,
      rows: mcItemsOf(geometry.pageMap).map((item) => ({
        sheetRow: item.sheetRow,
        origin: item.originMm,
      })),
    };
  }
  const grid = geometry.columnsPerPage;
  const perPage = questionsPerPage(grid);
  const first = (page - 1) * perPage;
  const count = Math.max(0, Math.min(perPage, geometry.questionCount - first));
  return {
    grid,
    rows: Array.from({ length: count }, (_, i) => ({
      sheetRow: first + i,
      origin: mcRowOriginMm(i, grid),
    })),
  };
}

/** A row the student did not get right: a wrong, blank or unclear row with a key. */
function rowMissed(fill: SheetFill, i: number): boolean {
  const mark = fill.marks[i];
  if (mark) return mark !== 'correct';
  const key = fill.key[i];
  return key !== null && key !== undefined && fill.filled[i] !== key;
}

/** Where the margin mark centres for a row: left of its number cell. */
function markCentre(row: Row, grid: PaperGrid): PointMm {
  if (grid === 'questions') {
    return {
      x: row.origin.x - MARK_GAP_MM,
      y: row.origin.y + QUESTION_CHOICE_TOP_MM + BUBBLE_DIAMETER_MM / 2,
    };
  }
  return {
    x: row.origin.x - MARK_GAP_MM,
    y: row.origin.y + BUBBLE_DIAMETER_MM / 2,
  };
}

function glyphSvg(
  d: string,
  centre: PointMm,
  size: number,
  stroke: string
): string {
  const s = size;
  const t = `translate(${num(centre.x - s / 2)} ${num(centre.y - s / 2)}) scale(${num(s)})`;
  const sw = (w: number) => num(w / s);
  // A white halo first, so the mark reads over a stray pencil line.
  return `<path transform="${t}" d="${d}" fill="none" stroke="#fff" stroke-width="${sw(MARK_STROKE_MM + 0.7)}" stroke-linecap="round" stroke-linejoin="round"/><path transform="${t}" d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw(MARK_STROKE_MM)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function keyRingSvg(bubble: RectMm, grid: PaperGrid): string {
  const cx = bubble.x + bubble.w / 2;
  const cy = bubble.y + bubble.h / 2;
  const ring = (r: number) =>
    `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="none" stroke="${KEY_INK}" stroke-width="${num(KEY_STROKE_MM)}"/>`;
  if (grid !== 'questions') return KEY_RINGS_MM.map(ring).join('');
  // A solid pointer left of the ring says "this one" without crowding the next choice.
  const tip = cx - KEY_RING_TIGHT_MM - 0.5;
  return `${ring(KEY_RING_TIGHT_MM)}<path d="M${num(tip)} ${num(cy)} L${num(tip - 2.4)} ${num(cy - 1.3)} L${num(tip - 2.4)} ${num(cy + 1.3)} Z" fill="${KEY_INK}"/>`;
}

/** Points, the teacher's comment and the numbered markup comments for one box, in the right margin. */
function feedbackColumnHtml(
  top: number,
  bottom: number,
  points: string | undefined,
  comment: string | undefined,
  rows: readonly { number: number; text: string; ink: string }[],
  reportFollows: boolean
): string {
  const width = FEEDBACK_RIGHT_MM - FEEDBACK_X_MM;
  const parts: string[] = [];
  let used = 0;
  if (points) {
    parts.push(
      `<div style="font-size:${POINTS_PT}pt;font-weight:700;line-height:${mm(POINTS_LINE_MM)};white-space:nowrap;overflow:hidden">${escapeHtml(points)}</div>`
    );
    used += POINTS_LINE_MM;
  }
  let budget = Math.floor((bottom - top - used - 0.6) / NOTE_LINE_MM);
  const lead = comment?.trim() ?? '';
  if (lead && budget > 0) {
    // The overall comment keeps at most half the lines when numbered comments follow.
    const room = rows.length ? Math.max(1, budget >> 1) : budget;
    const text = cutToLines(lead, width, NOTE_PT, room);
    const lines = Math.min(room, wrapLines(text, width, NOTE_PT));
    parts.push(
      `<div style="font-size:${NOTE_PT}pt;line-height:${mm(NOTE_LINE_MM)};max-height:${mm(lines * NOTE_LINE_MM)};overflow:hidden;overflow-wrap:anywhere">${escapeHtml(text)}</div>`
    );
    budget -= lines;
  }
  const moreText = (n: number) =>
    reportFollows ? `+${n} more in the report` : `+${n} more`;
  // Lines the "+n more" note takes at its widest count.
  const moreLines = wrapLines(moreText(rows.length), width, NOTE_PT);
  let shown = 0;
  for (const row of rows) {
    const left = rows.length - shown;
    // Keep room for "+n more" whenever a later comment would not fit.
    const reserve = left > 1 ? moreLines : 0;
    const room = budget - reserve;
    if (room < 1) break;
    const text = cutToLines(row.text, width - CHIP_MM, NOTE_PT, room);
    const lines = Math.min(room, wrapLines(text, width - CHIP_MM, NOTE_PT));
    if (lines > room) break;
    parts.push(
      `<div style="display:flex;align-items:flex-start;margin-top:0.4mm;font-size:${NOTE_PT}pt;line-height:${mm(NOTE_LINE_MM)}"><span style="flex:none;width:${mm(CHIP_MM)}">${markupNumberChipHtml(row.number, row.ink, 4, 8, false)}</span><span style="flex:1;min-width:0;max-height:${mm(lines * NOTE_LINE_MM)};overflow:hidden;overflow-wrap:anywhere">${escapeHtml(text)}</span></div>`
    );
    budget -= lines;
    shown += 1;
  }
  const hidden = rows.length - shown;
  if (hidden > 0 && budget > 0) {
    parts.push(
      `<div style="font-size:${NOTE_PT}pt;line-height:${mm(NOTE_LINE_MM)};font-style:italic">${moreText(hidden)}</div>`
    );
  }
  if (parts.length === 0) return '';
  return `<div class="scan-fb" style="left:${mm(FEEDBACK_X_MM)};top:${mm(top)};width:${mm(width)};max-height:${mm(bottom - top)}">${parts.join('')}</div>`;
}

/** One `<section>` printing the kept page with patches, marks, key rings, points and markup on top. */
export function buildScanSheetPageHtml(
  input: ScanSheetPageInput
): string | null {
  if (!input.pageSrc) return null;
  const { fill, options } = input;
  const missedOnly = options.questionScope === 'missed';
  const { rows, grid } = rowsOnPage(input);
  const choiceCount = Math.max(1, input.geometry.choiceCount);

  const svg: string[] = scanSheetPatchRectsMm().map(
    (r) =>
      `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" fill="#fff"/>`
  );
  for (const row of rows) {
    const i = row.sheetRow;
    if (missedOnly && !rowMissed(fill, i)) continue;
    const mark = fill.marks[i];
    if (mark) {
      svg.push(
        glyphSvg(
          MARK_GLYPH[mark],
          markCentre(row, grid),
          MARK_MM,
          MARK_INK[mark]
        )
      );
    }
    const key = fill.key[i];
    if (key !== null && key !== undefined && key < choiceCount) {
      svg.push(keyRingSvg(bubbleRectAtOriginMm(row.origin, key, grid), grid));
    }
  }

  const html: string[] = [];
  if (options.showScore && fill.score) {
    const area = scanSheetPatchRectsMm()[0];
    html.push(
      `<div class="scan-score" style="left:${mm(area.x + 1.5)};top:${mm(area.y + 1.5)};width:${mm(area.w - 3)};font-size:${SCORE_PT}pt">${escapeHtml(fill.score)}</div>`
    );
  }

  const written = input.geometry.pageMap
    ? writtenItemsOf(input.geometry.pageMap).sort(
        (a, b) => a.headerMm.y - b.headerMm.y
      )
    : [];
  const markupAnswers: (readonly PaperMarkupItem[])[] = [];
  written.forEach((item, idx) => {
    const fw = fill.written?.[item.questionId];
    const items = input.markup?.[item.questionId]?.items;
    const marked = Array.isArray(items) && items.length > 0 ? items : null;
    if (marked) markupAnswers.push(marked);
    const next = written[idx + 1];
    const bottom = Math.min(
      next ? next.headerMm.y - 1.5 : FEEDBACK_BOTTOM_MM,
      FEEDBACK_BOTTOM_MM
    );
    const comment = options.showWrittenFeedback ? fw?.comment : undefined;
    const col = feedbackColumnHtml(
      item.headerMm.y,
      bottom,
      fw?.points,
      comment,
      marked ? markupCommentRows(marked) : [],
      !!input.reportFollows
    );
    if (col) html.push(col);
  });
  const markupSvg = markupAnswers.length
    ? renderPaperMarkupAnswers(markupAnswers, FULL_PAGE_VIEWPORT_MM, {
        overlay: true,
      }).svg
    : '';

  return `<section class="sheet scan-sheet" data-scan-page="${input.page}"><img class="scan-img" src="${escapeHtml(input.pageSrc)}" alt="${escapeHtml(`Scanned page ${input.page}`)}"><svg class="scan-marks" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH_MM} ${PAGE_HEIGHT_MM}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${svg.join('')}</svg>${html.join('')}${markupSvg}</section>`;
}

/** Print styles for scan pages, added beside `SHEET_REPRINT_STYLES` when a page prints. */
export const SCAN_SHEET_STYLES = `
  .scan-sheet .scan-img, .scan-sheet .scan-marks { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }
  .scan-sheet .scan-img { object-fit: fill; }
  .scan-score, .scan-fb { position: absolute; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .scan-score { font-weight: 700; line-height: 1.3; }
  .scan-fb { overflow: hidden; padding: 0 0.6mm 0.3mm; }
`;
