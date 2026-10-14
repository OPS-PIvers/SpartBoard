// Which versions print the same picture: crops compared pixel by pixel after trimming (QUIZ_IMPORT_VERSIONS V4).

import type { FigureBox } from './pdfFigures';
import type { SharedFigure } from './types';

/** RGBA pixels, row-major, four bytes a pixel. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** A channel at or above this, with the other two, reads as paper. */
export const PAPER_THRESHOLD = 245;
/** Per-channel difference two renders of one picture can show from anti-aliasing. */
export const PIXEL_TOLERANCE = 8;

const isPaper = (data: Pixels['data'], i: number): boolean =>
  data[i + 3] < 16 ||
  (data[i] >= PAPER_THRESHOLD &&
    data[i + 1] >= PAPER_THRESHOLD &&
    data[i + 2] >= PAPER_THRESHOLD);

/** The pixels with every all-paper edge row and column cut off; null when nothing is printed. */
export function trimPaper(p: Pixels): Pixels | null {
  const rowBlank = (y: number): boolean => {
    for (let x = 0; x < p.width; x++)
      if (!isPaper(p.data, (y * p.width + x) * 4)) return false;
    return true;
  };
  const colBlank = (x: number, top: number, bottom: number): boolean => {
    for (let y = top; y <= bottom; y++)
      if (!isPaper(p.data, (y * p.width + x) * 4)) return false;
    return true;
  };
  let top = 0;
  while (top < p.height && rowBlank(top)) top++;
  if (top === p.height) return null;
  let bottom = p.height - 1;
  while (bottom > top && rowBlank(bottom)) bottom--;
  let left = 0;
  while (left < p.width && colBlank(left, top, bottom)) left++;
  let right = p.width - 1;
  while (right > left && colBlank(right, top, bottom)) right--;

  const width = right - left + 1;
  const height = bottom - top + 1;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * p.width + left) * 4;
    data.set(p.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, data };
}

/** True when both crops print the same picture once their margins are trimmed. */
export function pixelsIdentical(
  a: Pixels,
  b: Pixels,
  tolerance = PIXEL_TOLERANCE
): boolean {
  const ta = trimPaper(a);
  const tb = trimPaper(b);
  if (!ta || !tb) return false;
  if (ta.width !== tb.width || ta.height !== tb.height) return false;
  for (let i = 0; i < ta.data.length; i++) {
    if (Math.abs(ta.data[i] - tb.data[i]) > tolerance) return false;
  }
  return true;
}

export interface FigureEntry {
  /** The version's own image id. */
  id: string;
  version: number;
  /** Same source crop means the same picture with no pixels to compare. */
  sourceKey?: string;
  pixels?: Pixels | null;
}

/** Each figure identical to one in an earlier version, mapped to that figure's id. */
export function linkIdenticalFigures(
  entries: readonly FigureEntry[],
  tolerance = PIXEL_TOLERANCE
): Record<string, string> {
  const links: Record<string, string> = {};
  const ordered = [...entries].sort((a, b) => a.version - b.version);
  ordered.forEach((entry, index) => {
    const earlier = ordered
      .slice(0, index)
      .filter((e) => e.version < entry.version && !links[e.id]);
    const match = earlier.find(
      (e) =>
        (e.sourceKey !== undefined && e.sourceKey === entry.sourceKey) ||
        (!!e.pixels &&
          !!entry.pixels &&
          pixelsIdentical(e.pixels, entry.pixels, tolerance))
    );
    if (match) links[entry.id] = match.id;
  });
  return links;
}

const overlap = (a: FigureBox, b: FigureBox): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.width * a.height + b.width * b.height - inter);
};

/** The printed caption pass 1 read for the figure in this box, when one lines up. */
export function figureCaption(
  box: FigureBox,
  figures: readonly SharedFigure[]
): string | undefined {
  let best: { label: string; score: number } | undefined;
  for (const f of figures) {
    if (f.page !== box.page || !f.label) continue;
    const score = overlap(box, f);
    if (score >= 0.5 && (!best || score > best.score))
      best = { label: f.label, score };
  }
  return best?.label;
}
