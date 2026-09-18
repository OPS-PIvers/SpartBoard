/**
 * Renders paper answer sheets as a print document and hands it to the browser.
 *
 * Follows `components/widgets/DrawingWidget/exportCanvas.ts` deliberately: HTML
 * in a new window plus `window.print()`, so teachers get real printing and the
 * OS "Save as PDF" for free, with no PDF dependency. Everything is positioned
 * in millimetres from `paperSheetLayout.ts` so the scan reader can recompute
 * the same geometry. See docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §5.
 */

import {
  BUBBLE_DIAMETER_MM,
  CHOICE_LETTERS,
  COLUMN_X_MM,
  GRID_TOP_MM,
  HEADER_RECT_MM,
  MARKER_CELL_COUNT,
  MAX_CHOICE_COUNT,
  MIN_CHOICE_COUNT,
  NUMBER_WIDTH_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  QUESTIONS_PER_PAGE,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  ROWS_PER_COLUMN,
  ROW_PITCH_MM,
  bubbleRectMm,
  markerCellRectMm,
  pageCountForQuestions,
  questionSlotOnPage,
} from './paperSheetLayout';
import { encodePaperMarker, paperBatchTag } from './paperSheetMarker';
import type { PaperSheetPlan } from './paperSheetPlan';

export interface PaperPrintJob {
  batchId: string;
  quizTitle: string;
  questionCount: number;
  choiceCount: number;
  sheets: readonly PaperSheetPlan[];
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const mm = (n: number): string => `${n.toFixed(3)}mm`;

function registrationMarksHtml(): string {
  return REGISTRATION_MARK_CENTERS_MM.map(
    (c) =>
      `<div class="reg" style="left:${mm(c.x - REGISTRATION_MARK_SIZE_MM / 2)};top:${mm(
        c.y - REGISTRATION_MARK_SIZE_MM / 2
      )}"></div>`
  ).join('');
}

function markerHtml(
  batchId: string,
  seat: number,
  page: number,
  isKeySheet: boolean
): string {
  const bits = encodePaperMarker({
    batchTag: paperBatchTag(batchId),
    seat,
    page,
    isKeySheet,
  });
  const cells: string[] = [];
  for (let i = 0; i < MARKER_CELL_COUNT; i += 1) {
    if (!bits[i]) continue;
    const r = markerCellRectMm(i);
    cells.push(
      `<div class="cell" style="left:${mm(r.x)};top:${mm(r.y)};width:${mm(r.w)};height:${mm(r.h)}"></div>`
    );
  }
  return cells.join('');
}

function headerHtml(
  sheet: PaperSheetPlan,
  quizTitle: string,
  page: number,
  pageCount: number
): string {
  const line2 = [sheet.className, `Page ${page} of ${pageCount}`]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');
  return `<div class="hdr" style="left:${mm(HEADER_RECT_MM.x)};top:${mm(
    HEADER_RECT_MM.y
  )};width:${mm(HEADER_RECT_MM.w)};height:${mm(HEADER_RECT_MM.h)}">
      <div class="hdr-name${sheet.isKeySheet ? ' hdr-key' : ''}">${escapeHtml(sheet.displayName)}</div>
      <div class="hdr-quiz">${escapeHtml(quizTitle)}</div>
      <div class="hdr-meta">${line2}</div>
    </div>`;
}

/** "A B C D E" above each answer column; bubbles stay empty so every one inks alike. */
function columnLegendsHtml(choiceCount: number, columns: number): string {
  const parts: string[] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let choice = 0; choice < choiceCount; choice += 1) {
      // Read the x straight off the bubble it labels so the two cannot drift.
      const r = bubbleRectMm(column * ROWS_PER_COLUMN, choice);
      parts.push(
        `<div class="legend" style="left:${mm(r.x)};top:${mm(
          GRID_TOP_MM - 5
        )};width:${mm(r.w)}">${CHOICE_LETTERS[choice]}</div>`
      );
    }
  }
  return parts.join('');
}

function answerRowsHtml(
  page: number,
  questionCount: number,
  choiceCount: number
): { html: string; columns: number } {
  const first = (page - 1) * QUESTIONS_PER_PAGE;
  const onThisPage = Math.min(QUESTIONS_PER_PAGE, questionCount - first);
  const parts: string[] = [];
  let columns = 0;

  for (let i = 0; i < onThisPage; i += 1) {
    const { column, row } = questionSlotOnPage(i);
    columns = Math.max(columns, column + 1);
    parts.push(
      `<div class="num" style="left:${mm(COLUMN_X_MM[column])};top:${mm(
        GRID_TOP_MM + row * ROW_PITCH_MM
      )};width:${mm(NUMBER_WIDTH_MM - 2)}">${first + i + 1}</div>`
    );
    for (let choice = 0; choice < choiceCount; choice += 1) {
      const r = bubbleRectMm(i, choice);
      parts.push(
        `<div class="bub" style="left:${mm(r.x)};top:${mm(r.y)};width:${mm(r.w)};height:${mm(r.h)}"></div>`
      );
    }
  }
  return { html: parts.join(''), columns };
}

/** Every page of one student's sheet, each self-identifying (plan Q12). */
function sheetPagesHtml(
  sheet: PaperSheetPlan,
  job: PaperPrintJob,
  pageCount: number
): string {
  const choiceCount = Math.min(
    Math.max(job.choiceCount, MIN_CHOICE_COUNT),
    MAX_CHOICE_COUNT
  );
  const pages: string[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const rows = answerRowsHtml(page, job.questionCount, choiceCount);
    pages.push(
      `<div class="sheet">${registrationMarksHtml()}${markerHtml(
        job.batchId,
        sheet.seat,
        page,
        sheet.isKeySheet
      )}${headerHtml(sheet, job.quizTitle, page, pageCount)}${columnLegendsHtml(
        choiceCount,
        rows.columns
      )}${rows.html}</div>`
    );
  }
  return pages.join('');
}

const STYLES = `
  @page { size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet {
    position: relative;
    width: ${PAGE_WIDTH_MM}mm;
    height: ${PAGE_HEIGHT_MM}mm;
    overflow: hidden;
    page-break-after: always;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
  }
  .sheet:last-child { page-break-after: auto; }
  .reg, .cell, .hdr, .num, .bub, .legend { position: absolute; }
  .reg {
    width: ${REGISTRATION_MARK_SIZE_MM}mm;
    height: ${REGISTRATION_MARK_SIZE_MM}mm;
    background: #000;
  }
  .cell { background: #000; }
  .hdr { font-size: 10pt; line-height: 1.35; }
  .hdr-name { font-size: 13pt; font-weight: 700; }
  .hdr-key { letter-spacing: 0.08em; }
  .hdr-quiz { font-size: 11pt; }
  .hdr-meta { font-size: 9pt; color: #333; }
  .num {
    font-size: 8pt;
    text-align: right;
    line-height: ${BUBBLE_DIAMETER_MM}mm;
  }
  .legend { font-size: 7pt; text-align: center; color: #444; }
  .bub { border: 0.35mm solid #000; border-radius: 50%; background: #fff; }
`;

/**
 * Open the print dialog on a batch of answer sheets.
 *
 * `openWindow` is a test seam, matching `exportPdf`. Throws the same
 * distinguishable error when a pop-up blocker refuses the window, so the UI can
 * tell "blocked" from "render failed".
 */
export function printPaperSheets(
  job: PaperPrintJob,
  openWindow: (url?: string, target?: string) => Window | null = (
    url,
    target
  ) => window.open(url, target)
): void {
  if (job.sheets.length === 0) return;

  const printWindow = openWindow('', '_blank');
  if (!printWindow) {
    throw new Error('Printing blocked: please allow pop-ups for this site.');
  }

  const pageCount = pageCountForQuestions(job.questionCount);
  const body = job.sheets
    .map((s) => sheetPagesHtml(s, job, pageCount))
    .join('');

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(job.quizTitle)} — answer sheets</title>
    <style>${STYLES}</style>
  </head>
  <body>${body}</body>
</html>`);
  printWindow.document.close();

  // Set before print(): Chrome fires onafterprint whether the teacher printed
  // or cancelled. The timeout covers browsers that do not fire it at all.
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    try {
      printWindow.close();
    } catch {
      /* already closed */
    }
  };
  printWindow.onafterprint = closeOnce;
  setTimeout(closeOnce, 60_000);

  printWindow.focus();
  printWindow.print();
}

/** The document `printPaperSheets` would write. Exported for tests and preview. */
export function buildPaperSheetsHtml(job: PaperPrintJob): string {
  const pageCount = pageCountForQuestions(job.questionCount);
  return job.sheets.map((s) => sheetPagesHtml(s, job, pageCount)).join('');
}
