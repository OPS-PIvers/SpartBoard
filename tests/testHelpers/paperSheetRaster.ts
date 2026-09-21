/**
 * Paints a synthetic scan of a paper answer sheet from the same millimetre
 * layout the printer uses, so reader tests exercise real geometry without a
 * browser canvas. Scale, offset, rotation and ink density are all dials.
 */

import {
  BUBBLE_DIAMETER_MM,
  BUBBLE_LETTER_GREY,
  MARKER_CELL_COUNT,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  REGISTRATION_MARK_CENTERS_MM,
  REGISTRATION_MARK_SIZE_MM,
  STIMULUS_RECT_MM,
  bubbleRectMm,
  markerCellRectMm,
  type PaperColumns,
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

/** A block of teacher artwork inside the right-half stimulus band (D4). */
export interface SyntheticStimulus {
  /** Share of the band's height the block covers, measured from its top. */
  heightFraction: number;
  /** Grey it is painted at; a photocopied photo lands near 0x80. */
  tone: number;
}

export interface SyntheticSheetOptions {
  marker: PaperMarkerPayload;
  questionCount: number;
  choiceCount: number;
  /** Answer columns the sheet was printed with; defaults to two. */
  columnsPerPage?: PaperColumns;
  /** Artwork stacked from the top of the stimulus band. */
  stimuli?: SyntheticStimulus[];
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
  /**
   * Paint the printed choice letter inside every bubble, as a filled grey disc
   * covering the whole area the reader samples. Shape is irrelevant — the page
   * is binarised before sampling — so this is the worst case any glyph could be.
   *
   * This painter is hard bimodal, so its Otsu cut lands near the ink value
   * rather than a real scan's. Good for proving the margin exists, not for
   * pinning the grey at which it runs out.
   */
  printedLetters?: boolean;
  /** Grey the printed letter is painted at; defaults to what the sheet prints. */
  letterGrey?: number;
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
  const ink = (px: number, py: number, density = 1, tone = 20) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    if (density < 1 && rand() > density) return;
    const o = (py * width + px) * 4;
    if (data[o] <= tone) return;
    data[o] = tone;
    data[o + 1] = tone;
    data[o + 2] = tone;
  };
  const fillRect = (r: RectMm, density = 1, tone = 20) => {
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
        ink(x, y, density, tone);
    }
  };
  const fillDisc = (
    r: RectMm,
    radiusMm: number,
    density = 1,
    innerMm = 0,
    tone = 20
  ) => {
    const c = toPx(r.x + r.w / 2, r.y + r.h / 2);
    const rp = radiusMm * pxPerMm;
    const ip = innerMm * pxPerMm;
    for (let y = Math.floor(c.y - rp); y <= Math.ceil(c.y + rp); y += 1) {
      for (let x = Math.floor(c.x - rp); x <= Math.ceil(c.x + rp); x += 1) {
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
        if (d <= rp && d >= ip) ink(x, y, density, tone);
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

  const columns = opts.columnsPerPage ?? 2;
  const rows = rowsOnPage(opts.marker.page, opts.questionCount, columns);
  const radius = BUBBLE_DIAMETER_MM / 2;
  const letterTone = opts.letterGrey ?? BUBBLE_LETTER_GREY;
  for (let row = 0; row < rows; row += 1) {
    for (let c = 0; c < opts.choiceCount; c += 1) {
      const rect = bubbleRectMm(row, c, columns);
      fillDisc(rect, radius, 1, radius - 0.3);
      if (opts.printedLetters) {
        fillDisc(rect, radius - 0.4, 1, 0, letterTone);
      }
    }
  }
  for (const mark of opts.marks ?? []) {
    fillDisc(
      bubbleRectMm(mark.row, mark.choice, columns),
      radius,
      mark.density ?? 1
    );
  }

  let stimulusTopMm = STIMULUS_RECT_MM.y;
  for (const stimulus of opts.stimuli ?? []) {
    const h = STIMULUS_RECT_MM.h * stimulus.heightFraction;
    fillRect(
      { x: STIMULUS_RECT_MM.x, y: stimulusTopMm, w: STIMULUS_RECT_MM.w, h },
      1,
      stimulus.tone
    );
    stimulusTopMm += h;
  }

  if (opts.noise) {
    for (let i = 0; i < width * height; i += 1) {
      if (rand() < opts.noise) ink(i % width, Math.floor(i / width));
    }
  }

  return { width, height, data };
}
