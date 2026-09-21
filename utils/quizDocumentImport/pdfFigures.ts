/**
 * Cropping a PDF's figures out of the page (D13).
 *
 * The AI reader gives a page and a box as fractions of it; the crop itself
 * needs a canvas, so the pixel maths lives here and the rendering goes behind
 * a port, the same split `utils/paperScanRaster.ts` uses.
 *
 * A box is a model's estimate, so every one is clamped to the page and a
 * little padding is added: a crop that clips the top off a diagram's label is
 * worse for the student than one with a margin of white around it.
 */

import type { ExtractedImage } from './types';

/** Where a figure sits, as fractions of the page from its top-left corner. */
export interface FigureBox {
  /** 1-based. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** What cropping needs of a rendered PDF. */
export interface PdfCropperDeps {
  /** The page's size at the scale this cropper renders at. */
  pageSize: (page: number) => Promise<{ width: number; height: number }>;
  /** The page's pixels inside `rect`, as an image file. */
  crop: (page: number, rect: PixelRect) => Promise<Blob>;
  pageCount: number;
  /** Releases the pdf.js document and its worker once cropping is done. */
  destroy?: () => Promise<unknown> | void;
}

/** Grown by this fraction of the page on every side before cropping. */
export const FIGURE_PADDING = 0.01;

/**
 * The box in pixels, clamped to the page. Null when what is left encloses
 * nothing, which is the case a crop cannot produce an image for.
 */
export function pixelRect(
  box: FigureBox,
  size: { width: number; height: number }
): PixelRect | null {
  const left = (box.x - FIGURE_PADDING) * size.width;
  const top = (box.y - FIGURE_PADDING) * size.height;
  const right = (box.x + box.width + FIGURE_PADDING) * size.width;
  const bottom = (box.y + box.height + FIGURE_PADDING) * size.height;

  const clampedLeft = Math.max(0, Math.floor(left));
  const clampedTop = Math.max(0, Math.floor(top));
  const clampedRight = Math.min(size.width, Math.ceil(right));
  const clampedBottom = Math.min(size.height, Math.ceil(bottom));

  const width = clampedRight - clampedLeft;
  const height = clampedBottom - clampedTop;
  if (width < 1 || height < 1) return null;
  return { left: clampedLeft, top: clampedTop, width, height };
}

/** Same page and same box to within a pixel of the page: one picture (D14). */
function boxKey(box: FigureBox): string {
  const round = (n: number) => Math.round(n * 1000);
  return [
    box.page,
    round(box.x),
    round(box.y),
    round(box.width),
    round(box.height),
  ].join(':');
}

export interface CroppedFigures {
  images: ExtractedImage[];
  /** Image id per input box, by the key `figureKey` returns; absent when it could not be cropped. */
  idByBox: Map<string, string>;
  warnings: string[];
}

export const figureKey = boxKey;

/**
 * Crops each distinct box once. Two questions that named the same picture get
 * the same image id, so it uploads once and links to both (D14).
 */
export async function cropPdfFigures(
  boxes: readonly FigureBox[],
  deps: PdfCropperDeps
): Promise<CroppedFigures> {
  const images: ExtractedImage[] = [];
  const idByBox = new Map<string, string>();
  const warnings: string[] = [];
  let failed = 0;

  try {
    for (const box of boxes) {
      const key = boxKey(box);
      if (idByBox.has(key)) continue;
      if (box.page > deps.pageCount) {
        failed += 1;
        continue;
      }
      try {
        const size = await deps.pageSize(box.page);
        const rect = pixelRect(box, size);
        if (!rect) {
          failed += 1;
          continue;
        }
        const blob = await deps.crop(box.page, rect);
        const id = `pdf-figure-${images.length + 1}`;
        images.push({
          id,
          blob,
          contentType: blob.type || 'image/png',
          name: `figure-page-${box.page}.png`,
        });
        idByBox.set(key, id);
      } catch {
        // One figure that won't crop must not cost the teacher the whole read.
        failed += 1;
      }
    }
  } finally {
    await deps.destroy?.();
  }

  if (failed > 0) {
    warnings.push(
      failed === 1
        ? 'One picture couldn’t be taken from the PDF — add it to the question that needs it in the editor.'
        : `${failed} pictures couldn’t be taken from the PDF — add them to the questions that need them in the editor.`
    );
  }

  return { images, idByBox, warnings };
}
