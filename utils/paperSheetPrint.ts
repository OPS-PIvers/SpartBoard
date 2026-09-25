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
  BUBBLE_PITCH_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  ROWS_PER_COLUMN,
  QUESTION_CHOICE_TEXT_GAP_MM,
  QUESTION_STEM_H_MM,
  QUESTION_STEM_W_MM,
  QUESTION_STEM_X_MM,
  bubbleRectAtOriginMm,
  bubbleRectMm,
  markerCellRectMm,
  mcRowOriginMm,
  pageCountForQuestions,
  questionSlotOnPage,
  questionsPerPage,
  type PaperGrid,
  type PointMm,
} from './paperSheetLayout';
import { isStimulusFreePage, mcItemsOf, writtenRuleYsMm } from './paperPageMap';
import { isPlaceholderLetterChoices } from './paperSheetPlan';
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
import type { PaperPageItem, PaperPageMap, PaperSheetStimulus } from '@/types';

export interface PaperPrintJob {
  batchId: string;
  quizTitle: string;
  questionCount: number;
  choiceCount: number;
  sheets: readonly PaperSheetPlan[];
  /**
   * Answer columns per page; absent = 2, the layout every batch printed before
   * sheet stimuli existed used (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D1).
   * `'questions'` prints each row's question text beside its bubbles.
   */
  columnsPerPage?: PaperGrid;
  /** Question text per sheet row, for the `'questions'` grid. */
  questionTexts?: readonly PaperSheetQuestionText[];
  /** Imported test's own number per row index, printed small inside the number cell. */
  rowLabels?: readonly (string | undefined)[];
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
  /** Page layout of a batch with written boxes (layoutVersion 2); every page then prints and reads by map. */
  pageMaps?: readonly PaperPageMap[];
  /** Stem per written question id, printed in its header when the header has room. */
  writtenTexts?: Readonly<Record<string, string>>;
}

/** What a question-text row prints beside its bubbles. */
export interface PaperSheetQuestionText {
  text: string;
  /** Option text in bubble-letter order. */
  choices: readonly string[];
}

/** A graded paper response redrawn onto its sheet (docs/plans/QUIZ_RESULTS_PRINT.md D22-D23). */
export interface SheetFill {
  /** Bubble the student filled, per sheet row; null where the row is empty. */
  filled: readonly (number | null)[];
  /** Bubble to ring as the key, per sheet row; null where no ring prints. */
  key: readonly (number | null)[];
  /** Margin mark per sheet row. */
  marks: readonly ('correct' | 'incorrect' | 'unclear' | null)[];
  /** Printed in the header box when set. */
  score?: string;
}

const mm = (n: number): string => `${n.toFixed(3)}mm`;

/** Rule line weight in a written box; drawn at the letter grey so the reader's cut drops it. */
export const WRITTEN_RULE_MM = 0.3;

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
  isKeySheet: boolean,
  readByMap: boolean
): string {
  const bits = encodePaperMarker({
    batchTag: paperBatchTag(batchId),
    seat,
    page,
    isKeySheet,
    ...(readByMap ? { readByMap: true as const } : {}),
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
 * An image is an `<img>`; a template is drawn inline as SVG (D9).
 * `object-fit: contain` is the belt to the fit function's braces — a stored
 * pixel size that turns out to be wrong letterboxes rather than stretching
 * the teacher's diagram.
 */
function stimuliHtml(job: PaperPrintJob, page: number): string {
  // Two columns of answers leave no band to print into, whatever the job says.
  if (!job.sheetStimuli?.length || job.columnsPerPage !== 1) return '';
  const map = job.pageMaps?.[page - 1];
  // A box wider than the left column takes the band, so the stimulus waits for the next page (D10).
  if (map && isStimulusFreePage(map)) return '';
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
  printedForTeacherName?: string,
  score?: string
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
      <div class="hdr-meta">${line2}</div>${
        score ? `\n      <div class="hdr-score">${escapeHtml(score)}</div>` : ''
      }
    </div>`;
}

/** "A B C D E" above each answer column, repeating the letter each bubble carries. */
function columnLegendsHtml(
  choiceCount: number,
  columns: number,
  columnsPerPage: PaperGrid
): string {
  // Every bubble on the question-text grid sits beside its own choice.
  if (columnsPerPage === 'questions') return '';
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

/** The stem above a question's bubbles, and each choice's text beside its own bubble. */
function questionTextHtml(origin: PointMm, q: PaperSheetQuestionText): string {
  const parts = [
    `<div class="qt-stem" style="left:${mm(QUESTION_STEM_X_MM)};top:${mm(
      origin.y
    )};width:${mm(QUESTION_STEM_W_MM)};height:${mm(QUESTION_STEM_H_MM)}">${escapeHtml(
      q.text
    )}</div>`,
  ];
  // A stub's options are just the bubble letters, which say nothing to a student.
  if (!isPlaceholderLetterChoices(q.choices)) {
    q.choices.slice(0, MAX_CHOICE_COUNT).forEach((choice, i) => {
      const b = bubbleRectAtOriginMm(origin, i, 'questions');
      const x = b.x + b.w + QUESTION_CHOICE_TEXT_GAP_MM;
      const r = {
        x,
        y: b.y,
        w: QUESTION_STEM_X_MM + QUESTION_STEM_W_MM - x,
        h: b.h,
      };
      parts.push(
        `<div class="qt-choice" style="left:${mm(r.x)};top:${mm(r.y)};width:${mm(
          r.w
        )};height:${mm(r.h)}">${escapeHtml(choice)}</div>`
      );
    });
  }
  return parts.join('');
}

const MARK_GLYPH = { correct: '✓', incorrect: '✗', unclear: '?' } as const;

/** One MC row: number, optional question text, bubbles and its reprint mark. */
function mcRowHtml(
  origin: PointMm,
  index: number,
  printedNumber: string,
  choiceCount: number,
  columnsPerPage: PaperGrid,
  fill?: SheetFill,
  questionTexts?: readonly PaperSheetQuestionText[],
  rowLabels?: readonly (string | undefined)[]
): string {
  const parts: string[] = [];
  const label = rowLabels?.[index];
  // The label shrinks and clips inside the fixed number cell so bubbles never move.
  const numberHtml = label
    ? `<span>${escapeHtml(printedNumber)}</span><span class="num-src">(${escapeHtml(label)})</span>`
    : escapeHtml(printedNumber);
  parts.push(
    `<div class="${columnsPerPage === 'questions' ? 'num qnum' : 'num'}${
      label ? ' labelled' : ''
    }" style="left:${mm(origin.x)};top:${mm(origin.y)};width:${mm(
      NUMBER_WIDTH_MM - 2
    )}">${numberHtml}</div>`
  );
  const text = questionTexts?.[index];
  if (columnsPerPage === 'questions' && text) {
    parts.push(questionTextHtml(origin, text));
  }
  for (let choice = 0; choice < choiceCount; choice += 1) {
    const r = bubbleRectAtOriginMm(origin, choice, columnsPerPage);
    const cls = fill
      ? `bub${fill.filled[index] === choice ? ' filled' : ''}${
          fill.key[index] === choice ? ' key' : ''
        }`
      : 'bub';
    parts.push(
      `<div class="${cls}" style="left:${mm(r.x)};top:${mm(r.y)};width:${mm(r.w)};height:${mm(
        r.h
      )}">${CHOICE_LETTERS[choice]}</div>`
    );
  }
  const mark = fill?.marks[index];
  if (mark) {
    const r = bubbleRectAtOriginMm(origin, choiceCount - 1, columnsPerPage);
    // Beside the number on the question-text grid, where choice text fills the row.
    const left =
      columnsPerPage === 'questions'
        ? COLUMN_X_MM[0] - BUBBLE_PITCH_MM
        : r.x + BUBBLE_PITCH_MM;
    const top = columnsPerPage === 'questions' ? origin.y : r.y;
    parts.push(
      `<div class="rowmark" style="left:${mm(left)};top:${mm(top)}">${
        MARK_GLYPH[mark]
      }</div>`
    );
  }
  return parts.join('');
}

function answerRowsHtml(
  page: number,
  questionCount: number,
  choiceCount: number,
  columnsPerPage: PaperGrid,
  fill?: SheetFill,
  questionTexts?: readonly PaperSheetQuestionText[],
  rowLabels?: readonly (string | undefined)[]
): { html: string; columns: number } {
  const perPage = questionsPerPage(columnsPerPage);
  const first = (page - 1) * perPage;
  const onThisPage = Math.min(perPage, questionCount - first);
  const parts: string[] = [];
  let columns = 0;

  for (let i = 0; i < onThisPage; i += 1) {
    const { column } = questionSlotOnPage(i, columnsPerPage);
    columns = Math.max(columns, column + 1);
    const index = first + i;
    parts.push(
      mcRowHtml(
        mcRowOriginMm(i, columnsPerPage),
        index,
        String(index + 1),
        choiceCount,
        columnsPerPage,
        fill,
        questionTexts,
        rowLabels
      )
    );
  }
  return { html: parts.join(''), columns };
}

type WrittenPageItem = Extract<PaperPageItem, { kind: 'written' }>;

/** Line height of a written header's stem, as `.qt-stem` sets it. */
const STEM_LINE_MM = 3.6;

/** Header lines a written header can hold at the stem's line height. */
const headerStemLines = (h: number): number => Math.floor(h / STEM_LINE_MM);

/** A written question: number and stem in its header, then ruled lines to write on (D9, D12). */
function writtenItemHtml(
  item: WrittenPageItem,
  grid: PaperGrid,
  isKeySheet: boolean,
  stem?: string
): string {
  const h = item.headerMm;
  const numberCls = grid === 'questions' ? 'num qnum' : 'num wr-num';
  const parts = [
    `<div class="${numberCls}" style="left:${mm(h.x)};top:${mm(h.y)};width:${mm(
      NUMBER_WIDTH_MM - 2
    )}">${escapeHtml(item.label)}</div>`,
  ];
  const lines = headerStemLines(h.h);
  if (stem?.trim() && lines >= 2) {
    const shown = Math.min(lines, 3);
    const x = grid === 'questions' ? QUESTION_STEM_X_MM : h.x + NUMBER_WIDTH_MM;
    parts.push(
      `<div class="qt-stem wr-stem" style="left:${mm(x)};top:${mm(h.y)};width:${mm(
        h.x + h.w - x
      )};height:${mm(shown * STEM_LINE_MM)};-webkit-line-clamp:${shown}">${escapeHtml(
        stem
      )}</div>`
    );
  }
  const b = item.boxMm;
  const box = `left:${mm(b.x)};top:${mm(b.y)};width:${mm(b.w)};height:${mm(b.h)}`;
  // The key never carries handwriting, so its boxes print as a band nobody writes in (D16).
  if (isKeySheet) {
    parts.push(`<div class="wr-key" style="${box}">Graded by teacher</div>`);
    return parts.join('');
  }
  for (const y of writtenRuleYsMm(item)) {
    parts.push(
      `<div class="wr-rule" style="left:${mm(b.x)};top:${mm(
        y - WRITTEN_RULE_MM
      )};width:${mm(b.w)}"></div>`
    );
  }
  return parts.join('');
}

/** "A B C D E" over each column that starts at the grid top, as the arithmetic layout prints. */
function mapLegendsHtml(map: PaperPageMap, choiceCount: number): string {
  if (map.grid === 'questions') return '';
  const xs = new Set<number>();
  for (const item of mcItemsOf(map)) {
    if (item.originMm.y === GRID_TOP_MM) xs.add(item.originMm.x);
  }
  const parts: string[] = [];
  for (const x of xs) {
    for (let choice = 0; choice < choiceCount; choice += 1) {
      const r = bubbleRectAtOriginMm({ x, y: GRID_TOP_MM }, choice, map.grid);
      parts.push(
        `<div class="legend" style="left:${mm(r.x)};top:${mm(
          GRID_TOP_MM - 5
        )};width:${mm(r.w)}">${CHOICE_LETTERS[choice]}</div>`
      );
    }
  }
  return parts.join('');
}

/** Everything a map page prints between its header and footer. */
function mapPageBodyHtml(
  map: PaperPageMap,
  job: PaperPrintJob,
  sheet: PaperSheetPlan,
  choiceCount: number,
  fill?: SheetFill
): string {
  const parts = [mapLegendsHtml(map, choiceCount)];
  for (const item of map.items) {
    if (item.kind === 'mc') {
      parts.push(
        mcRowHtml(
          item.originMm,
          item.sheetRow,
          item.label,
          choiceCount,
          map.grid,
          fill,
          job.questionTexts,
          job.rowLabels
        )
      );
    } else {
      parts.push(
        writtenItemHtml(
          item,
          map.grid,
          sheet.isKeySheet,
          job.writtenTexts?.[item.questionId]
        )
      );
    }
  }
  return parts.join('');
}

/**
 * Every page of one student's sheet, each self-identifying (plan Q12). A
 * `fill` redraws a graded response and leaves off the marker grid and
 * registration squares, so a reprint can never be scanned back in (D23).
 */
function sheetPagesHtml(
  sheet: PaperSheetPlan,
  job: PaperPrintJob,
  pageCount: number,
  fill?: SheetFill
): string {
  const choiceCount = Math.min(
    Math.max(job.choiceCount, MIN_CHOICE_COUNT),
    MAX_CHOICE_COUNT
  );
  const columnsPerPage = job.columnsPerPage ?? DEFAULT_COLUMNS_PER_PAGE;
  const pages: string[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const map = job.pageMaps?.[page - 1];
    let body: string;
    if (map) {
      body = mapPageBodyHtml(map, job, sheet, choiceCount, fill);
    } else {
      const rows = answerRowsHtml(
        page,
        job.questionCount,
        choiceCount,
        columnsPerPage,
        fill,
        job.questionTexts,
        job.rowLabels
      );
      body = `${columnLegendsHtml(choiceCount, rows.columns, columnsPerPage)}${rows.html}`;
    }
    const scanMarks = fill
      ? ''
      : `${registrationMarksHtml()}${markerHtml(
          job.batchId,
          sheet.seat,
          page,
          sheet.isKeySheet,
          !!job.pageMaps
        )}`;
    pages.push(
      `<div class="sheet">${scanMarks}${headerHtml(
        sheet,
        job.quizTitle,
        page,
        pageCount,
        job.printedForTeacherName,
        fill?.score
      )}${body}${stimuliHtml(job, page)}${footerHtml()}</div>`
    );
  }
  return pages.join('');
}

const SHEET_STYLES = `
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
  .reg, .cell, .hdr, .num, .bub, .legend, .foot, .stim, .stim-cap, .qt-stem, .qt-choice, .wr-rule, .wr-key { position: absolute; }
  .wr-rule { height: ${WRITTEN_RULE_MM}mm; background: ${letterGrey()}; }
  .wr-key {
    background: #e5e5e5;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10pt;
    font-weight: 700;
    color: #333;
  }
  .qt-stem {
    font-size: 9pt;
    line-height: 3.6mm;
    color: #000;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
  }
  .qt-choice {
    font-size: 9pt;
    line-height: ${BUBBLE_DIAMETER_MM}mm;
    color: #000;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
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
  .num.labelled {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 0.6mm;
    white-space: nowrap;
    overflow: hidden;
  }
  .num.labelled span:first-child { flex-shrink: 0; }
  .num-src {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 5.5pt;
    color: #444;
  }
  .num.qnum { font-size: 9pt; font-weight: 700; line-height: 3.6mm; }
  .num.wr-num { line-height: 3.6mm; }
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

const STYLES = `
  @page { size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }${SHEET_STYLES}`;

/**
 * Sheet styles for a reprint inside another document: a named page keeps the
 * sheet margin-free beside a report that has its own margins.
 */
export const SHEET_REPRINT_STYLES = `
  @page reprint { size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm; margin: 0; }
  .sheet-set .sheet { page: reprint; }
  .sheet-set, .sheet-set * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }${SHEET_STYLES}
  .rowmark { position: absolute; font-size: 10pt; font-weight: 700; line-height: ${BUBBLE_DIAMETER_MM}mm; }
  .hdr-score { font-size: 11pt; font-weight: 700; }
  .bub.filled { background: #000; color: #fff; }
  .bub.key { outline: 0.9mm double #000; outline-offset: 0.3mm; }
`;

/** One graded sheet's pages, for a reprint. */
export function buildFilledSheetHtml(
  sheet: PaperSheetPlan,
  job: Pick<
    PaperPrintJob,
    | 'batchId'
    | 'quizTitle'
    | 'questionCount'
    | 'choiceCount'
    | 'columnsPerPage'
    | 'questionTexts'
    | 'pageMaps'
    | 'writtenTexts'
  >,
  pageCount: number,
  fill: SheetFill
): string {
  return sheetPagesHtml(sheet, { ...job, sheets: [sheet] }, pageCount, fill);
}

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
  const pageCount = job.pageMaps
    ? job.pageMaps.length
    : pageCountForQuestions(job.questionCount, job.columnsPerPage);
  return job.sheets.map((s) => sheetPagesHtml(s, job, pageCount)).join('');
}
