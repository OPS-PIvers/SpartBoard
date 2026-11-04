// Lays out the recess gear face in px: the message as a headline, then the picture beside the temperature.

export type MeasureText = (text: string) => number;

export interface GearLayout {
  pad: number;
  headlineWidth: number;
  headlineHeight: number;
  fontSize: number;
  // The picture and temperature sit side by side, or stacked when the space under the headline is tall.
  row: 'side' | 'stacked';
  rowHeight: number;
  image: number;
  tempWidth: number;
  tempHeight: number;
}

export const GEAR_LINE_HEIGHT = 1.15;
const MIN_FONT = 4;
const WIDTH_SAFETY = 0.96;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// Bold sans text runs about 0.56em per character; used when canvas measuring is unavailable.
export const estimateTextWidth: MeasureText = (text) =>
  [...text].reduce((w, ch) => w + (ch === ' ' ? 0.28 : 0.56), 0);

export const toParagraphs = (text: string): string[][] =>
  text
    .split('\n')
    .map((line) => line.split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);

const linesAt = (
  paragraphs: string[][],
  font: number,
  maxWidth: number,
  measure: MeasureText
): number | null => {
  let lines = 0;
  for (const words of paragraphs) {
    let current = '';
    for (const word of words) {
      if (measure(word) * font > maxWidth) return null;
      const next = current ? `${current} ${word}` : word;
      if (current && measure(next) * font > maxWidth) {
        lines += 1;
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines += 1;
  }
  return lines;
};

export const fitFontSize = (
  paragraphs: string[][],
  boxWidth: number,
  boxHeight: number,
  maxFont: number,
  measure: MeasureText
): number => {
  if (boxWidth <= 0 || boxHeight <= 0 || paragraphs.length === 0) return 0;
  const width = boxWidth * WIDTH_SAFETY;
  const fits = (font: number) => {
    const lines = linesAt(paragraphs, font, width, measure);
    return lines !== null && lines * font * GEAR_LINE_HEIGHT <= boxHeight;
  };
  if (fits(maxFont)) return maxFont;
  let lo = MIN_FONT;
  let hi = maxFont;
  if (!fits(lo)) return lo;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 2) / 2;
};

export const layoutRecessGear = ({
  width,
  height,
  text,
  measure,
  textScale = 1,
}: {
  width: number;
  height: number;
  text: string;
  measure: MeasureText;
  textScale?: number;
}): GearLayout => {
  const short = Math.max(1, Math.min(width, height));
  const pad = clamp(short * 0.05, 4, 20);
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  const paragraphs = toParagraphs(text);

  // A tall window stacks the picture over the temperature; otherwise the row is about as tall as a 40%-wide picture.
  const tall = innerH > innerW * 1.5;
  const rowTarget = tall
    ? innerH * 0.54
    : clamp(innerW * 0.4, innerH * 0.38, innerH * 0.54);
  const maxHeadline = Math.max(0, innerH - rowTarget - pad);
  const fontSize = fitFontSize(
    paragraphs,
    innerW,
    maxHeadline,
    short * 0.2 * textScale,
    measure
  );
  // The headline gives back any height its wrapped lines don't use.
  const lines = linesAt(paragraphs, fontSize, innerW * WIDTH_SAFETY, measure);
  const headlineHeight = Math.min(
    maxHeadline,
    (lines ?? 1) * fontSize * GEAR_LINE_HEIGHT
  );

  const rowHeight = Math.max(0, innerH - headlineHeight - pad);
  // The row's top padding and its gap are each half the outer padding.
  const gap = pad * 0.5;
  const rowInner = Math.max(0, rowHeight - gap - 1);
  const stacked = tall;
  const image = stacked
    ? Math.min(innerW * 0.7, rowInner * 0.48)
    : Math.min(rowInner, innerW * 0.4);
  const tempWidth = stacked ? innerW : innerW - image - gap;
  const tempHeight = stacked ? rowInner - image - gap : rowInner;

  return {
    pad,
    headlineWidth: innerW,
    headlineHeight,
    fontSize,
    row: stacked ? 'stacked' : 'side',
    rowHeight,
    image,
    tempWidth: Math.max(0, tempWidth),
    tempHeight: Math.max(0, tempHeight),
  };
};
