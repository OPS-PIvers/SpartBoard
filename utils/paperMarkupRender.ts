// Image markup drawn in sheet millimetres (docs/plans/QUIZ_PAPER_KEPT_PAGES.md §3.3); one call serves a crop or a whole page.
import type { PaperMarkupItem, PaperPointMm, PaperRectMm } from '@/types';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from './paperSheetLayout';
import { READER_THRESHOLDS } from './paperSheetReader';

/** Margin the reader adds around a box before cropping it. */
export const PAPER_CROP_MARGIN_MM = READER_THRESHOLDS.writtenCropMarginMm;

/** The whole US Letter sheet, for drawing over a kept page. */
export const FULL_PAGE_VIEWPORT_MM: Readonly<PaperRectMm> = {
  x: 0,
  y: 0,
  w: PAGE_WIDTH_MM,
  h: PAGE_HEIGHT_MM,
};

/** Natural pixel size of a loaded image (`img.naturalWidth` / `naturalHeight`). */
export interface ImageSizePx {
  width: number;
  height: number;
}

/** The sheet area a handwriting crop shows: its box plus the crop margin. */
export function cropViewportMm(boxMm: PaperRectMm): PaperRectMm {
  const m = PAPER_CROP_MARGIN_MM;
  return {
    x: boxMm.x - m,
    y: boxMm.y - m,
    w: boxMm.w + m * 2,
    h: boxMm.h + m * 2,
  };
}

// Scales come from the image's real size, so a crop the encoder halved still maps exactly.
const scaleOf = (viewport: PaperRectMm, image: ImageSizePx) => ({
  x: image.width / viewport.w,
  y: image.height / viewport.h,
});

/** A point in crop pixels (natural size) to sheet millimetres. */
export function cropPxToSheetMm(
  px: PaperPointMm,
  boxMm: PaperRectMm,
  image: ImageSizePx
): PaperPointMm {
  const view = cropViewportMm(boxMm);
  const s = scaleOf(view, image);
  return { x: view.x + px.x / s.x, y: view.y + px.y / s.y };
}

/** A point in sheet millimetres to crop pixels (natural size). */
export function sheetMmToCropPx(
  mm: PaperPointMm,
  boxMm: PaperRectMm,
  image: ImageSizePx
): PaperPointMm {
  const view = cropViewportMm(boxMm);
  const s = scaleOf(view, image);
  return { x: (mm.x - view.x) * s.x, y: (mm.y - view.y) * s.y };
}

/** A rect in crop pixels to sheet millimetres. */
export function cropRectPxToSheetMm(
  rect: PaperRectMm,
  boxMm: PaperRectMm,
  image: ImageSizePx
): PaperRectMm {
  const a = cropPxToSheetMm({ x: rect.x, y: rect.y }, boxMm, image);
  const b = cropPxToSheetMm(
    { x: rect.x + rect.w, y: rect.y + rect.h },
    boxMm,
    image
  );
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** A rect in sheet millimetres to crop pixels. */
export function sheetRectMmToCropPx(
  rect: PaperRectMm,
  boxMm: PaperRectMm,
  image: ImageSizePx
): PaperRectMm {
  const a = sheetMmToCropPx({ x: rect.x, y: rect.y }, boxMm, image);
  const b = sheetMmToCropPx(
    { x: rect.x + rect.w, y: rect.y + rect.h },
    boxMm,
    image
  );
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** One numbered comment printed under its answer (K10). */
export interface PaperMarkupComment {
  /** 1-based, per answer, in item order. */
  number: number;
  itemId: string;
  text: string;
}

/** Items carrying a non-blank comment, numbered 1..n in item order; the pin numbers match. */
export function numberMarkupComments(
  items: readonly PaperMarkupItem[]
): PaperMarkupComment[] {
  const out: PaperMarkupComment[] = [];
  for (const item of items) {
    const text = item.comment?.trim();
    if (text) out.push({ number: out.length + 1, itemId: item.id, text });
  }
  return out;
}

export interface PaperMarkupRenderOptions {
  /** Class on the `<svg>`, so the caller can position it over the image. */
  className?: string;
}

export interface PaperMarkupRender {
  /** `<svg viewBox>` in millimetres of the viewport; scales to whatever box holds it. */
  svg: string;
  /** The numbered comment list for under the answer. */
  comments: PaperMarkupComment[];
}

/** One answer's markup as an SVG drawn over `viewportMm` (a crop's `cropViewportMm` or `FULL_PAGE_VIEWPORT_MM`). Stub until slice D. */
export function renderPaperMarkup(
  items: readonly PaperMarkupItem[],
  viewportMm: PaperRectMm,
  options: PaperMarkupRenderOptions = {}
): PaperMarkupRender {
  const v = viewportMm;
  const cls = options.className ? ` class="${options.className}"` : '';
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg"${cls} viewBox="${v.x} ${v.y} ${v.w} ${v.h}" preserveAspectRatio="none" aria-hidden="true"></svg>`,
    comments: numberMarkupComments(items),
  };
}
