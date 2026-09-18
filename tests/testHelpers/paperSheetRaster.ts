/**
 * Paints a synthetic scan of a paper answer sheet from the same millimetre
 * layout the printer uses, so reader tests exercise real geometry without a
 * browser canvas. Scale, offset, rotation and ink density are all dials.
 */

import {
  BUBBLE_DIAMETER_MM,
  MARKER_CELL_COUNT,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  bubbleRectMm,
  markerCellRectMm,
  type RectMm,
} from '@/utils/paperSheetLayout';
import {
  encodePaperMarker,
  type PaperMarkerPayload,
} from '@/utils/paperSheetMarker';
import type { RasterPage } from '@/utils/paperSheetReader';
import { rowsOnPage } from '@/utils/paperSheetReader';

export interface SyntheticMark {
  row: number;
  choice: number;
  /** 0..1 chance each pixel is inked; 1 = solid, ~0.3 = a faint pencil mark. */
  density?: number;
}

export interface SyntheticSheetOptions {
  marker: PaperMarkerPayload;
  questionCount: number;
  choiceCount: number;
  marks?: SyntheticMark[];
  /** Pixels per millimetre; 200 dpi is about 7.87. */
  pxPerMm?: number;
  /** Scanner offset in pixels, applied after scaling. */
  offsetPx?: { x: number; y: number };
  /** Feed the page upside down. */
  rotated?: boolean;
  /** Small skew about the page centre, in degrees, as a crooked feed would give. */
  skewDeg?: number;
  /** Leave out one registration mark, by index. */
  dropRegistrationMark?: number;
  /** Random speckle probability per pixel. */
  noise?: number;
  /** Deterministic pseudo-random source. */
  seed?: number;
}

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function paintSyntheticSheet(opts: SyntheticSheetOptions): RasterPage {
  const pxPerMm = opts.pxPerMm ?? 7.87;
  const offset = opts.offsetPx ?? { x: 0, y: 0 };
  const width = Math.round(PAGE_WIDTH_MM * pxPerMm + offset.x * 2);
  const height = Math.round(PAGE_HEIGHT_MM * pxPerMm + offset.y * 2);
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const rand = mulberry32(opts.seed ?? 1);

  const skew = ((opts.skewDeg ?? 0) * Math.PI) / 180;
  const toPx = (xMm: number, yMm: number) => {
    const x = (opts.rotated ? PAGE_WIDTH_MM - xMm : xMm) - PAGE_WIDTH_MM / 2;
    const y = (opts.rotated ? PAGE_HEIGHT_MM - yMm : yMm) - PAGE_HEIGHT_MM / 2;
    const rx = x * Math.cos(skew) - y * Math.sin(skew) + PAGE_WIDTH_MM / 2;
    const ry = x * Math.sin(skew) + y * Math.cos(skew) + PAGE_HEIGHT_MM / 2;
    return { x: rx * pxPerMm + offset.x, y: ry * pxPerMm + offset.y };
  };
  const ink = (px: number, py: number, density = 1) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    if (density < 1 && rand() > density) return;
    const o = (py * width + px) * 4;
    data[o] = 20;
    data[o + 1] = 20;
    data[o + 2] = 20;
  };
  const fillRect = (r: RectMm, density = 1) => {
    const a = toPx(r.x, r.y);
    const b = toPx(r.x + r.w, r.y + r.h);
    for (
      let y = Math.floor(Math.min(a.y, b.y));
      y < Math.max(a.y, b.y);
      y += 1
    ) {
      for (
        let x = Math.floor(Math.min(a.x, b.x));
        x < Math.max(a.x, b.x);
        x += 1
      )
        ink(x, y, density);
    }
  };
  const fillDisc = (r: RectMm, radiusMm: number, density = 1, innerMm = 0) => {
    const c = toPx(r.x + r.w / 2, r.y + r.h / 2);
    const rp = radiusMm * pxPerMm;
    const ip = innerMm * pxPerMm;
    for (let y = Math.floor(c.y - rp); y <= Math.ceil(c.y + rp); y += 1) {
      for (let x = Math.floor(c.x - rp); x <= Math.ceil(c.x + rp); x += 1) {
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
        if (d <= rp && d >= ip) ink(x, y, density);
      }
    }
  };

  REGISTRATION_MARK_CENTERS_MM.forEach((centre, i) => {
    if (i === opts.dropRegistrationMark) return;
    fillRect({
      x: centre.x - REGISTRATION_MARK_SIZE_MM / 2,
      y: centre.y - REGISTRATION_MARK_SIZE_MM / 2,
      w: REGISTRATION_MARK_SIZE_MM,
      h: REGISTRATION_MARK_SIZE_MM,
    });
  });

  const cells = encodePaperMarker(opts.marker);
  for (let i = 0; i < MARKER_CELL_COUNT; i += 1) {
    if (cells[i]) fillRect(markerCellRectMm(i));
  }

  const rows = rowsOnPage(opts.marker.page, opts.questionCount);
  const radius = BUBBLE_DIAMETER_MM / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let c = 0; c < opts.choiceCount; c += 1) {
      fillDisc(bubbleRectMm(row, c), radius, 1, radius - 0.3);
    }
  }
  for (const mark of opts.marks ?? []) {
    fillDisc(bubbleRectMm(mark.row, mark.choice), radius, mark.density ?? 1);
  }

  if (opts.noise) {
    for (let i = 0; i < width * height; i += 1) {
      if (rand() < opts.noise) ink(i % width, Math.floor(i / width));
    }
  }

  return { width, height, data };
}
