import {
  QUESTION_STEM_MAX_LINES,
  QUESTION_STEM_W_MM,
} from './paperSheetLayout';

/** Width of `text` in mm at the printed stem's font. */
export type StemMeasure = (text: string) => number;

/** Wrap slack, so a browser that sets text a hair wider still fits the lines counted. */
const WRAP_WIDTH_MM = QUESTION_STEM_W_MM * 0.94;

/** Lines `text` wraps to in the stem box, capped at what the box shows. */
export function stemLineCount(text: string, measure: StemMeasure): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let lines = 1;
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > WRAP_WIDTH_MM) {
      lines += 1;
      if (lines >= QUESTION_STEM_MAX_LINES) return QUESTION_STEM_MAX_LINES;
      line = word;
    } else {
      line = next;
    }
  }
  return lines;
}

const PX_TO_MM = 25.4 / 96;

/** Measures at the sheet's 9pt Arial; null without a canvas, and callers then assume full stems. */
export function browserStemMeasure(): StemMeasure | null {
  if (typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext('2d');
  // jsdom hands back a context object with no measureText.
  if (typeof ctx?.measureText !== 'function') return null;
  ctx.font = '9pt Arial, Helvetica, sans-serif';
  return (text) => ctx.measureText(text).width * PX_TO_MM;
}

/** Printed stem lines per question id, for `planPaperPages` on a question-text sheet. */
export function stemLinesById(
  questions: readonly { id: string; text: string }[],
  measure: StemMeasure | null
): Record<string, number> | undefined {
  if (!measure) return undefined;
  return Object.fromEntries(
    questions.map((q) => [q.id, stemLineCount(q.text, measure)])
  );
}
