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
  BUBBLE_LETTER_GREY,
  BUBBLE_LETTER_SIZE_PT,
  CHOICE_LETTERS,
  COLUMN_X_MM,
  DEFAULT_COLUMNS_PER_PAGE,
  FOOTER_RECT_MM,
  GRID_TOP_MM,
  HEADER_RECT_MM,
  MARKER_CELL_COUNT,
  MAX_CHOICE_COUNT,
  MIN_CHOICE_COUNT,
  NUMBER_WIDTH_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  ROWS_PER_COLUMN,
  ROW_PITCH_MM,
  bubbleRectMm,
  markerCellRectMm,
  pageCountForQuestions,
  questionSlotOnPage,
  questionsPerPage,
  type PaperColumns,
} from './paperSheetLayout';
import { encodePaperMarker, paperBatchTag } from './paperSheetMarker';
import type { PaperSheetPlan } from './paperSheetPlan';
import {
  CAPTION_SIZE_PT,
  layoutSheetStimuli,
} from './paperSheetStimulusLayout';
import { renderTemplateSvg } from './paperSheetTemplateSvg';
import {
  escapeHtml,
  printHtmlDocument,
  type OpenWindow,
} from './printHtmlDocument';
import { SPARTRON_TAGLINE, spartronLogoSvg } from './spartronLogo';
import type { PaperSheetStimulus } from '@/types';

export interface PaperPrintJob {
  batchId: string;
  quizTitle: string;
  questionCount: number;
  choiceCount: number;
  sheets: readonly PaperSheetPlan[];
  /**
   * Answer columns per page; absent = 2, the layout every batch printed before
   * sheet stimuli existed used (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D1).
   */
  columnsPerPage?: PaperColumns;
  /** Items printed in the sheet's right-hand band; every sheet gets them (D15). */
  sheetStimuli?: readonly PaperSheetStimulus[];
  /**
   * Image data for each stimulus by id, already fetched to an object URL by
   * the caller (D16). A stimulus with no entry is not drawn.
   */
  stimulusImageSrc?: Readonly<Record<string, string>>;
  /**
   * Whose classes this stack is for, when a PLC teammate printed it
   * (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md D17). Absent on the self-print
   * path, which renders exactly as it did before delegation existed.
   */
  printedForTeacherName?: string;
  /**
   * Called once the print document has decoded the stimulus images, so a
   * caller that owns their object URLs knows when it may free them.
   */
  onImagesReady?: () => void;
}

const mm = (n: number): string => `${n.toFixed(3)}mm`;

/** `BUBBLE_LETTER_GREY` as a CSS colour, so the print and the reader's floor share one number. */
const letterGrey = (): string =>
  `#${BUBBLE_LETTER_GREY.toString(16).padStart(2, '0').repeat(3)}`;

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

function footerHtml(): string {
  return `<div class="foot" style="left:${mm(FOOTER_RECT_MM.x)};top:${mm(
    FOOTER_RECT_MM.y
  )};width:${mm(FOOTER_RECT_MM.w)};height:${mm(
    FOOTER_RECT_MM.h
  )}">${spartronLogoSvg(4.2)}<span class="foot-tag">${escapeHtml(SPARTRON_TAGLINE)}</span></div>`;
}

/**
 * The stimulus stack for one page (D12).
 *
 * Only images are drawn: a template is a spec rather than a file and its
 * renderer arrives with the template picker. `object-fit: contain` is the
 * belt to the fit function's braces — a stored pixel size that turns out to
 * be wrong letterboxes rather than stretching the teacher's diagram.
 */
function stimuliHtml(job: PaperPrintJob, page: number): string {
  // Two columns of answers leave no band to print into, whatever the job says.
  if (!job.sheetStimuli?.length || job.columnsPerPage !== 1) return '';
  const parts: string[] = [];
  for (const item of layoutSheetStimuli(job.sheetStimuli, page).items) {
    const src = job.stimulusImageSrc?.[item.stimulus.id];
    const r = item.rect;
    const box = `left:${mm(r.x)};top:${mm(r.y)};width:${mm(r.w)};height:${mm(r.h)}`;
    if (item.stimulus.source === 'image' && src) {
      parts.push(
        `<img class="stim" alt="" src="${escapeHtml(src)}" style="${box}" />`
      );
    }
    // A template is drawn, not fetched, so it never waits on anything (D9).
    if (item.stimulus.source === 'template' && item.stimulus.template) {
      parts.push(
        `<div class="stim" style="${box}">${renderTemplateSvg(
          item.stimulus.template,
          r.w,
          r.h
        )}</div>`
      );
    }
    if (item.captionRect && item.caption) {
      const c = item.captionRect;
      parts.push(
        `<div class="stim-cap" style="left:${mm(c.x)};top:${mm(c.y)};width:${mm(
          c.w
        )};height:${mm(c.h)}">${escapeHtml(item.caption)}</div>`
      );
    }
  }
  return parts.join('');
}

function headerHtml(
  sheet: PaperSheetPlan,
  quizTitle: string,
  page: number,
  pageCount: number,
  printedForTeacherName?: string
): string {
  const line2 = [
    printedForTeacherName,
    sheet.className,
    `Page ${page} of ${pageCount}`,
  ]
    .filter((part): part is string => !!part)
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

/** "A B C D E" above each answer column, repeating the letter each bubble carries. */
function columnLegendsHtml(
  choiceCount: number,
  columns: number,
  columnsPerPage: PaperColumns
): string {
  const parts: string[] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let choice = 0; choice < choiceCount; choice += 1) {
      // Read the x straight off the bubble it labels so the two cannot drift.
      const r = bubbleRectMm(column * ROWS_PER_COLUMN, choice, columnsPerPage);
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
  choiceCount: number,
  columnsPerPage: PaperColumns
): { html: string; columns: number } {
  const perPage = questionsPerPage(columnsPerPage);
  const first = (page - 1) * perPage;
  const onThisPage = Math.min(perPage, questionCount - first);
  const parts: string[] = [];
  let columns = 0;

  for (let i = 0; i < onThisPage; i += 1) {
    const { column, row } = questionSlotOnPage(i, columnsPerPage);
    columns = Math.max(columns, column + 1);
    parts.push(
      `<div class="num" style="left:${mm(COLUMN_X_MM[column])};top:${mm(
        GRID_TOP_MM + row * ROW_PITCH_MM
      )};width:${mm(NUMBER_WIDTH_MM - 2)}">${first + i + 1}</div>`
    );
    for (let choice = 0; choice < choiceCount; choice += 1) {
      const r = bubbleRectMm(i, choice, columnsPerPage);
      parts.push(
        `<div class="bub" style="left:${mm(r.x)};top:${mm(r.y)};width:${mm(r.w)};height:${mm(
          r.h
        )}">${CHOICE_LETTERS[choice]}</div>`
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
  const columnsPerPage = job.columnsPerPage ?? DEFAULT_COLUMNS_PER_PAGE;
  const pages: string[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const rows = answerRowsHtml(
      page,
      job.questionCount,
      choiceCount,
      columnsPerPage
    );
    pages.push(
      `<div class="sheet">${registrationMarksHtml()}${markerHtml(
        job.batchId,
        sheet.seat,
        page,
        sheet.isKeySheet
      )}${headerHtml(
        sheet,
        job.quizTitle,
        page,
        pageCount,
        job.printedForTeacherName
      )}${columnLegendsHtml(
        choiceCount,
        rows.columns,
        columnsPerPage
      )}${rows.html}${stimuliHtml(job, page)}${footerHtml()}</div>`
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
  .reg, .cell, .hdr, .num, .bub, .legend, .foot, .stim, .stim-cap { position: absolute; }
  .stim { object-fit: contain; }
  .stim-cap {
    font-size: ${CAPTION_SIZE_PT}pt;
    line-height: 1.3;
    text-align: center;
    overflow: hidden;
    color: #000;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3mm;
  }
  .foot svg { display: block; }
  .foot-tag {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #000;
  }
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
  .bub {
    border: 0.35mm solid #000;
    border-radius: 50%;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    font-size: ${BUBBLE_LETTER_SIZE_PT}pt;
    color: ${letterGrey()};
  }
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
  openWindow?: OpenWindow
): void {
  if (job.sheets.length === 0) return;
  printHtmlDocument(
    {
      title: `${job.quizTitle} — answer sheets`,
      styles: STYLES,
      body: buildPaperSheetsHtml(job),
      // A remote image that has not decoded yet prints as an empty box.
      awaitImages: !!job.sheetStimuli?.length,
      ...(job.onImagesReady ? { onImagesReady: job.onImagesReady } : {}),
    },
    openWindow
  );
}

/** The document `printPaperSheets` would write. Exported for tests and preview. */
export function buildPaperSheetsHtml(job: PaperPrintJob): string {
  const pageCount = pageCountForQuestions(
    job.questionCount,
    job.columnsPerPage
  );
  return job.sheets.map((s) => sheetPagesHtml(s, job, pageCount)).join('');
}
