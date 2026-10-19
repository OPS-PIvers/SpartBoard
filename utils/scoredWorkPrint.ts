/**
 * Stamps a teacher's own worksheet with the per-student corner marks and seat
 * marker the Spartron reader already understands, then prints one copy each.
 * The worksheet shrinks into the band between the header and the lower corner
 * search windows so nothing of the teacher's page can hide a registration mark.
 */

import {
  CORNER_WINDOW_H_MM,
  HEADER_RECT_MM,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  type RectMm,
} from './paperSheetLayout';
import {
  PAPER_SHEET_STYLES,
  footerHtml,
  markerHtml,
  registrationMarksHtml,
} from './paperSheetPrint';
import {
  escapeHtml,
  printHtmlDocument,
  type OpenWindow,
} from './printHtmlDocument';
import type { ScoredWorkSheet } from './scoredWorkPlan';

export interface ScoredWorkPrintJob {
  workId: string;
  title: string;
  pageCount: number;
  sheets: readonly ScoredWorkSheet[];
  /** One image URL per worksheet page, in order. */
  pageImageSrc: readonly string[];
  onImagesReady?: () => void;
}

const mm = (n: number): string => `${n.toFixed(3)}mm`;

/** Just under the header and marker grid. */
const BODY_TOP_MM = 48;
const BODY_SIDE_MM = 14;

/** Free area for the worksheet: clear of the header, footer and every corner window. */
export const SCORED_WORK_BODY_MM: RectMm = {
  x: BODY_SIDE_MM,
  y: BODY_TOP_MM,
  w: PAGE_WIDTH_MM - BODY_SIDE_MM * 2,
  h: PAGE_HEIGHT_MM - CORNER_WINDOW_H_MM - BODY_TOP_MM,
};

/** Scale and centre a worksheet page of `pageAspect` (w/h) into the body, never enlarging past the page. */
export function fitWorksheetPage(pageAspect: number): RectMm {
  const body = SCORED_WORK_BODY_MM;
  const aspect = pageAspect > 0 ? pageAspect : PAGE_WIDTH_MM / PAGE_HEIGHT_MM;
  let w = body.w;
  let h = w / aspect;
  if (h > body.h) {
    h = body.h;
    w = h * aspect;
  }
  return { x: body.x + (body.w - w) / 2, y: body.y, w, h };
}

function headerHtml(
  sheet: ScoredWorkSheet,
  title: string,
  page: number,
  pageCount: number
): string {
  const meta = [sheet.className, `Page ${page} of ${pageCount}`]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');
  return `<div class="hdr" style="left:${mm(HEADER_RECT_MM.x)};top:${mm(
    HEADER_RECT_MM.y
  )};width:${mm(HEADER_RECT_MM.w)};height:${mm(HEADER_RECT_MM.h)}">
      <div class="hdr-name">${escapeHtml(sheet.displayName)}</div>
      <div class="hdr-quiz">${escapeHtml(title)}</div>
      <div class="hdr-meta">${meta}</div>
    </div>`;
}

/** Every student's worksheet pages, one `.sheet` per page. Exported for tests. */
export function buildScoredWorkHtml(
  job: ScoredWorkPrintJob,
  pageAspects: readonly number[] = []
): string {
  const pages: string[] = [];
  for (const sheet of job.sheets) {
    for (let page = 1; page <= job.pageCount; page += 1) {
      const src = job.pageImageSrc[page - 1];
      const box = fitWorksheetPage(pageAspects[page - 1] ?? 0);
      const body = src
        ? `<img class="ws-page" src="${escapeHtml(src)}" alt="" style="left:${mm(
            box.x
          )};top:${mm(box.y)};width:${mm(box.w)};height:${mm(box.h)}">`
        : '';
      pages.push(
        `<div class="sheet">${registrationMarksHtml()}${markerHtml(
          job.workId,
          sheet.seat,
          page,
          false,
          false
        )}${headerHtml(sheet, job.title, page, job.pageCount)}${body}${footerHtml()}</div>`
      );
    }
  }
  return pages.join('');
}

const SCORED_WORK_STYLES = `${PAPER_SHEET_STYLES}
  .ws-page { position: absolute; object-fit: contain; }`;

/** Open the print dialog on one stamped worksheet per student. */
export function printScoredWork(
  job: ScoredWorkPrintJob,
  pageAspects: readonly number[] = [],
  openWindow?: OpenWindow
): void {
  if (job.sheets.length === 0) return;
  printHtmlDocument(
    {
      title: `${job.title} - scored work`,
      styles: SCORED_WORK_STYLES,
      body: buildScoredWorkHtml(job, pageAspects),
      awaitImages: true,
      ...(job.onImagesReady ? { onImagesReady: job.onImagesReady } : {}),
    },
    openWindow
  );
}
