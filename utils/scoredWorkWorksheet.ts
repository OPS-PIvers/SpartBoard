import { rasterizeScan, type RasterDeps } from './paperScanRaster';
import type { RectPx } from './paperSheetReader';

/** Longest edge of a printed worksheet page, about 200 dpi on US Letter. */
export const WORKSHEET_PRINT_EDGE_PX = 2200;

/** Most worksheet pages one print run takes; each page is embedded once. */
export const MAX_WORKSHEET_UPLOAD_PAGES = 12;

/** Luminance below this counts as ink when looking for page margins. */
const INK_LUMINANCE = 235;
/** Breathing room kept around the content, as a share of the page's long edge. */
const TRIM_PADDING = 0.012;
/** Sampling stride; margins are found to within a few pixels. */
const STRIDE = 2;

export interface WorksheetPages {
  /** Object URLs, one per page; free them with `release`. */
  srcs: string[];
  /** Width over height of each printed page image, after any trim. */
  aspects: number[];
  release: () => void;
}

/** The smallest box holding everything that is not near-white, or null on a blank page. */
export function inkBounds(page: {
  width: number;
  height: number;
  data: ArrayLike<number>;
}): RectPx | null {
  const { width, height, data } = page;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += STRIDE) {
    for (let x = 0; x < width; x += STRIDE) {
      const o = (y * width + x) * 4;
      const lum =
        (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
      if (lum < INK_LUMINANCE && data[o + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  // Sampled every STRIDE pixels, so the last sampled column stands for the next STRIDE.
  return { x: minX, y: minY, w: maxX - minX + STRIDE, h: maxY - minY + STRIDE };
}

/** Grow `rect` by the trim padding and keep it on the page. */
export function paddedBounds(
  rect: RectPx,
  width: number,
  height: number
): RectPx {
  const pad = Math.round(Math.max(width, height) * TRIM_PADDING);
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  return {
    x,
    y,
    w: Math.min(width, rect.x + rect.w + pad) - x,
    h: Math.min(height, rect.y + rect.h + pad) - y,
  };
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> =>
  (await fetch(dataUrl)).blob();

/** Rasterize a teacher's worksheet PDF or image into printable page images. */
export async function rasterizeWorksheet(
  file: Blob,
  options: { trim?: boolean; deps?: RasterDeps } = {}
): Promise<WorksheetPages> {
  const srcs: string[] = [];
  const aspects: number[] = [];
  const release = () => srcs.forEach((u) => URL.revokeObjectURL(u));
  try {
    for await (const raster of rasterizeScan(file, options.deps)) {
      if (srcs.length >= MAX_WORKSHEET_UPLOAD_PAGES) {
        throw new RangeError(
          `A worksheet can have at most ${MAX_WORKSHEET_UPLOAD_PAGES} pages.`
        );
      }
      const { width, height } = raster.page;
      const ink = options.trim ? inkBounds(raster.page) : null;
      const rect = ink
        ? paddedBounds(ink, width, height)
        : { x: 0, y: 0, w: width, h: height };
      const dataUrl = raster.crop(rect, WORKSHEET_PRINT_EDGE_PX);
      srcs.push(URL.createObjectURL(await dataUrlToBlob(dataUrl)));
      aspects.push(rect.w / rect.h);
    }
  } catch (error) {
    release();
    throw error;
  }
  if (srcs.length === 0) throw new Error('That file had no pages.');
  return { srcs, aspects, release };
}
