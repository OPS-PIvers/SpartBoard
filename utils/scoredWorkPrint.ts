/**
 * Stamps a teacher's own worksheet with the per-student corner marks and seat
 * marker the Spartron reader already understands, then prints one copy each.
 * The worksheet is scaled into the band under the header, clear of the corner marks.
 */

import {
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
  defaultOpenWindow,
  escapeHtml,
  printHtmlDocument,
  type OpenWindow,
} from './printHtmlDocument';
import type { ScoredWorkSheet } from './scoredWorkPlan';

/** `auto` turns a wide worksheet sideways when that makes it bigger. */
export type WorksheetOrientation = 'auto' | 'upright' | 'sideways';

export interface ScoredWorkPrintJob {
  workId: string;
  title: string;
  pageCount: number;
  sheets: readonly ScoredWorkSheet[];
  /** One image URL per worksheet page, in order. */
  pageImageSrc: readonly string[];
  orientation?: WorksheetOrientation;
  onImagesReady?: () => void;
}

const mm = (n: number): string => `${n.toFixed(3)}mm`;

/** Just under the header and marker grid. */
const BODY_TOP_MM = 46;
const BODY_SIDE_MM = 8;
/** Stops above the bottom corner marks and their search windows. */
const BODY_BOTTOM_MM = 246;

/** Free area for the worksheet. */
export const SCORED_WORK_BODY_MM: RectMm = {
  x: BODY_SIDE_MM,
  y: BODY_TOP_MM,
  w: PAGE_WIDTH_MM - BODY_SIDE_MM * 2,
  h: BODY_BOTTOM_MM - BODY_TOP_MM,
};

export interface WorksheetPlacement {
  /** Where the worksheet appears on the sheet, after any turn. */
  box: RectMm;
  /** Turned a quarter turn clockwise onto the portrait sheet. */
  rotated: boolean;
}

/** Scale and centre a shape of `aspect` (w/h) into the body. */
export function fitWorksheetPage(aspect: number): RectMm {
  const body = SCORED_WORK_BODY_MM;
  const a = aspect > 0 ? aspect : PAGE_WIDTH_MM / PAGE_HEIGHT_MM;
  let w = body.w;
  let h = w / a;
  if (h > body.h) {
    h = body.h;
    w = h * a;
  }
  return { x: body.x + (body.w - w) / 2, y: body.y, w, h };
}

export function placeWorksheet(
  aspect: number,
  orientation: WorksheetOrientation = 'auto'
): WorksheetPlacement {
  const upright = fitWorksheetPage(aspect);
  const turned = fitWorksheetPage(aspect > 0 ? 1 / aspect : 0);
  const rotated =
    orientation === 'sideways' ||
    (orientation === 'auto' && turned.w * turned.h > upright.w * upright.h);
  return { box: rotated ? turned : upright, rotated };
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

function worksheetImageHtml(src: string, place: WorksheetPlacement): string {
  const { box, rotated } = place;
  // A turned image is laid out unturned, centred on its final box, then rotated.
  const w = rotated ? box.h : box.w;
  const h = rotated ? box.w : box.h;
  const left = box.x + box.w / 2 - w / 2;
  const top = box.y + box.h / 2 - h / 2;
  return `<img class="ws-page" src="${escapeHtml(src)}" alt="" style="left:${mm(
    left
  )};top:${mm(top)};width:${mm(w)};height:${mm(h)}${
    rotated ? ';transform:rotate(90deg)' : ''
  }">`;
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
      const place = placeWorksheet(pageAspects[page - 1] ?? 0, job.orientation);
      pages.push(
        `<div class="sheet">${registrationMarksHtml()}${markerHtml(
          job.workId,
          sheet.seat,
          page,
          false,
          false
        )}${headerHtml(sheet, job.title, page, job.pageCount)}${
          src ? worksheetImageHtml(src, place) : ''
        }${footerHtml()}</div>`
      );
    }
  }
  return pages.join('');
}

export const SCORED_WORK_STYLES = `${PAPER_SHEET_STYLES}
  .ws-page { position: absolute; object-fit: contain; transform-origin: center; }`;

/** Open the print window on the click itself; browsers block a window opened after any await. */
export function openPrintWindow(
  openWindow: OpenWindow = defaultOpenWindow
): Window {
  const win = openWindow('', '_blank');
  if (!win) {
    throw new Error('Printing blocked: please allow pop-ups for this site.');
  }
  try {
    win.document.write(
      '<p style="font-family:sans-serif;padding:24px">Preparing your sheets...</p>'
    );
  } catch {
    // A window we cannot write to still prints once the sheets are ready.
  }
  return win;
}

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
