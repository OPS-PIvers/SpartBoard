/**
 * Fits the stimuli of one page into the answer sheet's right-hand band
 * (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D10-D13).
 *
 * Pure, and shared by the print modal's preview and the printer, so what a
 * teacher sees before printing is what comes out of the copier.
 */

import type { PaperSheetStimulus, PaperSheetTemplate } from '@/types';
import { STIMULUS_RECT_MM, type RectMm } from './paperSheetLayout';

/** Stimuli printed on one page; the rest of a longer list is not drawn (D10). */
export const MAX_STIMULI_PER_PAGE = 4;

/** Gap between stacked items. */
export const STIMULUS_GAP_MM = 4;

export const CAPTION_SIZE_PT = 9;
export const CAPTION_MAX_LENGTH = 120;
export const CAPTION_MAX_LINES = 2;
/** 9 pt at the repo's print line height, in millimetres. */
const CAPTION_LINE_HEIGHT_MM = 4.2;
/** Space between an item and its caption. */
const CAPTION_GAP_MM = 1.2;
/** Characters of 9 pt Arial that fit across the band; sets the caption's lines. */
const CAPTION_CHARS_PER_LINE = 58;

/** Shape assumed for an image whose pixel size was never recorded. */
const FALLBACK_IMAGE_ASPECT = 3 / 4;

/** Height a number line needs whatever its range; it is a rule, not a box. */
const NUMBER_LINE_HEIGHT_MM = 26;

/** One stimulus placed on the page, in millimetres from the page's corner. */
export interface PlacedStimulus {
  stimulus: PaperSheetStimulus;
  /** Where the item itself is drawn. */
  rect: RectMm;
  /** Where its caption is drawn; absent when it has none. */
  captionRect?: RectMm;
  /** The caption as it will print, trimmed and capped at 120 characters. */
  caption?: string;
  /** Caption lines the rect was reserved for; 1 or 2. */
  captionLines?: number;
}

export interface StimulusPageLayout {
  items: PlacedStimulus[];
  /**
   * Factor every item was shrunk by to make the stack fit; 1 when it fitted at
   * natural size. Captions are never shrunk — 9 pt is already the floor.
   */
  scale: number;
  /** Stimuli past the per-page cap, which are not drawn (D10). */
  dropped: PaperSheetStimulus[];
}

const captionText = (stimulus: PaperSheetStimulus): string =>
  (stimulus.caption ?? '').trim().slice(0, CAPTION_MAX_LENGTH);

/** Lines a caption wraps to, capped at two (D13). */
export function captionLineCount(caption: string): number {
  if (!caption) return 0;
  return Math.min(
    CAPTION_MAX_LINES,
    Math.max(1, Math.ceil(caption.length / CAPTION_CHARS_PER_LINE))
  );
}

/** Height a template needs at `widthMm`, from its own spec (D9). */
export function templateHeightMm(
  template: PaperSheetTemplate,
  widthMm: number
): number {
  switch (template.kind) {
    // Square, so a unit on one axis is a unit on the other.
    case 'coordinate-grid':
      return widthMm;
    case 'number-line':
      return NUMBER_LINE_HEIGHT_MM;
    default:
      return template.heightMm;
  }
}

/** Height one item wants at the band's full width, before any shrinking. */
export function naturalHeightMm(
  stimulus: PaperSheetStimulus,
  widthMm: number
): number {
  if (stimulus.source === 'template' && stimulus.template) {
    return templateHeightMm(stimulus.template, widthMm);
  }
  const { widthPx, heightPx } = stimulus;
  if (!widthPx || !heightPx || widthPx <= 0 || heightPx <= 0) {
    return widthMm * FALLBACK_IMAGE_ASPECT;
  }
  return (widthMm * heightPx) / widthPx;
}

/** The stimuli of `page`, in author order, capped at the per-page limit. */
export function stimuliOnPage(
  stimuli: readonly PaperSheetStimulus[],
  page: number
): { shown: PaperSheetStimulus[]; dropped: PaperSheetStimulus[] } {
  const forPage = stimuli.filter(
    (s) => s.page === undefined || s.page === page
  );
  return {
    shown: forPage.slice(0, MAX_STIMULI_PER_PAGE),
    dropped: forPage.slice(MAX_STIMULI_PER_PAGE),
  };
}

/**
 * Stimuli pinned to a page the test no longer has (D11).
 *
 * The print modal flags these and they are not printed, rather than silently
 * moving to a page the teacher did not choose.
 */
export function stimuliOffTheEnd(
  stimuli: readonly PaperSheetStimulus[],
  pageCount: number
): PaperSheetStimulus[] {
  return stimuli.filter((s) => s.page !== undefined && s.page > pageCount);
}

/**
 * Place one page's stack in the band, top-aligned at natural size when it
 * fits and shrunk by one shared factor when it does not (D12). Nothing is
 * ever cropped or stretched.
 */
export function layoutSheetStimuli(
  stimuli: readonly PaperSheetStimulus[],
  page: number,
  band: RectMm = STIMULUS_RECT_MM
): StimulusPageLayout {
  const { shown, dropped } = stimuliOnPage(stimuli, page);
  if (shown.length === 0) return { items: [], scale: 1, dropped };

  const captions = shown.map((s) => captionText(s));
  const captionLines = captions.map((c) => captionLineCount(c));
  const captionHeights = captionLines.map((lines) =>
    lines === 0 ? 0 : CAPTION_GAP_MM + lines * CAPTION_LINE_HEIGHT_MM
  );
  const naturalHeights = shown.map((s) => naturalHeightMm(s, band.w));

  const gaps = STIMULUS_GAP_MM * (shown.length - 1);
  const fixed = gaps + captionHeights.reduce((a, b) => a + b, 0);
  const bodies = naturalHeights.reduce((a, b) => a + b, 0);
  // Captions hold their 9 pt whatever happens, so only the bodies absorb the
  // shrink and the room left for them is what is left after the captions.
  const room = band.h - fixed;
  const scale = bodies <= room ? 1 : Math.max(0, room / bodies);

  const width = band.w * scale;
  const x = band.x + (band.w - width) / 2;
  const items: PlacedStimulus[] = [];
  let top = band.y;
  shown.forEach((stimulus, i) => {
    const h = naturalHeights[i] * scale;
    const rect: RectMm = { x, y: top, w: width, h };
    top += h;
    const item: PlacedStimulus = { stimulus, rect };
    if (captionLines[i] > 0) {
      item.caption = captions[i];
      item.captionRect = {
        x,
        y: top + CAPTION_GAP_MM,
        w: width,
        h: captionLines[i] * CAPTION_LINE_HEIGHT_MM,
      };
      item.captionLines = captionLines[i];
      top += captionHeights[i];
    }
    top += STIMULUS_GAP_MM;
    items.push(item);
  });

  return { items, scale, dropped };
}
