// Sizes the recess gear panel in px from the measured widget face, fitting the message as large as it can go.

export type MeasureText = (text: string) => number;

export interface GearLayout {
  orientation: 'row' | 'column';
  tempWidth: number;
  tempHeight: number;
  pad: number;
  panelWidth: number;
  panelHeight: number;
  panelPad: number;
  radius: number;
  arrangement: 'side' | 'stacked' | 'text';
  image: number;
  textWidth: number;
  textHeight: number;
  fontSize: number;
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
  const pad = clamp(short * 0.035, 3, 14);
  const orientation = width / Math.max(1, height) >= 1.6 ? 'row' : 'column';
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);

  const tempWidth = orientation === 'row' ? Math.round(innerW * 0.42) : innerW;
  const tempHeight =
    orientation === 'row'
      ? innerH
      : Math.round(innerH * (short < 220 ? 0.36 : 0.4));
  const panelWidth = orientation === 'row' ? innerW - tempWidth - pad : innerW;
  const panelHeight =
    orientation === 'row' ? innerH : innerH - tempHeight - pad;

  const panelShort = Math.max(1, Math.min(panelWidth, panelHeight));
  const panelPad = clamp(panelShort * 0.07, 3, 18);
  const radius = clamp(panelShort * 0.09, 6, 18);
  const gap = clamp(panelShort * 0.06, 3, 16);
  const boxW = Math.max(0, panelWidth - panelPad * 2);
  const boxH = Math.max(0, panelHeight - panelPad * 2);
  const maxFont = short * 0.14 * textScale;
  const paragraphs = toParagraphs(text);

  type Candidate = Pick<
    GearLayout,
    'arrangement' | 'image' | 'textWidth' | 'textHeight' | 'fontSize'
  >;
  const shape = (arrangement: 'side' | 'stacked', share: number): Candidate => {
    const side = arrangement === 'side';
    const image = Math.max(
      0,
      side ? Math.min(boxH, boxW * share) : Math.min(boxW, boxH * share)
    );
    const textWidth = side ? boxW - image - gap : boxW;
    const textHeight = side ? boxH : boxH - image - gap;
    return {
      arrangement,
      image,
      textWidth,
      textHeight,
      fontSize: fitFontSize(
        paragraphs,
        textWidth,
        textHeight,
        maxFont,
        measure
      ),
    };
  };
  let candidates = [shape('side', 0.4), shape('stacked', 0.5)];
  // Shrink the picture only when the full-size one leaves the words small.
  if (Math.max(...candidates.map((c) => c.fontSize)) < 16) {
    candidates = [...candidates, shape('side', 0.28), shape('stacked', 0.34)];
  }

  const best = Math.max(...candidates.map((c) => c.fontSize));
  // Favor big words and a big picture; a column under about six words wide reads as a list.
  const score = (c: Candidate) =>
    c.fontSize < best * 0.7
      ? 0
      : c.fontSize *
        Math.sqrt(c.image) *
        (c.textWidth >= c.fontSize * 6 ? 1 : 0.7);
  let chosen: Candidate = [...candidates].sort(
    (a, b) => score(b) - score(a)
  )[0];

  // Only drop the picture when keeping it would leave the words too small to read.
  if (chosen.fontSize < 14) {
    const textOnly = fitFontSize(paragraphs, boxW, boxH, maxFont, measure);
    if (textOnly > chosen.fontSize * 1.25) {
      chosen = {
        arrangement: 'text',
        image: 0,
        textWidth: boxW,
        textHeight: boxH,
        fontSize: textOnly,
      };
    }
  }

  return {
    orientation,
    tempWidth,
    tempHeight,
    pad,
    panelWidth,
    panelHeight,
    panelPad,
    radius,
    arrangement: chosen.arrangement,
    image: chosen.image,
    textWidth: Math.max(0, chosen.textWidth),
    textHeight: Math.max(0, chosen.textHeight),
    fontSize: chosen.fontSize,
  };
};
