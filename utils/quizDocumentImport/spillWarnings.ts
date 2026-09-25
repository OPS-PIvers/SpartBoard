/** Review warnings for text that likely spilled into the wrong place (QUIZ_IMPORT_RELIABILITY.md R18). */

export type SpillKind = 'key' | 'choice';

export interface SpillWarning {
  /** `stem`, or the index into the choices passed in. */
  at: 'stem' | number;
  kind: SpillKind;
}

const LONG_OPTION = 200;
/** Short options ("Yes", "12") make a 3× ratio meaningless below this. */
const MIN_RATIO_LENGTH = 40;

// "21. B" or "3) c" standing alone, as a key entry prints: not "1. A mixture".
const KEY_PAIR = /(?:^|\s)\d{1,3}\s*[.)]\s*[A-Fa-f](?=\s*$|\s+\d|\s*[,;])/;
// "b. text", "(c) text" or "D) text"; a bare "A." is left out so "Vitamin A. is" never counts.
const OPTION_MARKER = /(?:^|\s)(?:\([a-fA-F]\)|[a-f][.)]|[A-F]\))\s+\S/g;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const markerCount = (text: string): number =>
  (text.match(OPTION_MARKER) ?? []).length;

/** Warnings for one question's stem and choices; empty when it reads cleanly. */
export function spillWarnings(
  stem: string,
  choices: readonly string[]
): SpillWarning[] {
  const out: SpillWarning[] = [];
  if (KEY_PAIR.test(stem)) out.push({ at: 'stem', kind: 'key' });
  else if (markerCount(stem) >= 2) out.push({ at: 'stem', kind: 'choice' });

  const lengths = choices.map((c) => c.trim().length);
  const typical = choices.length >= 3 ? median(lengths) : 0;
  choices.forEach((choice, i) => {
    const text = choice.trim();
    if (KEY_PAIR.test(text)) {
      out.push({ at: i, kind: 'key' });
      return;
    }
    const tooLong =
      text.length > LONG_OPTION ||
      (typical > 0 &&
        text.length >= MIN_RATIO_LENGTH &&
        text.length > 3 * typical);
    if (tooLong || markerCount(text) > 0) out.push({ at: i, kind: 'choice' });
  });
  return out;
}

export const spillMessage = (w: SpillWarning): string =>
  w.at === 'stem'
    ? w.kind === 'key'
      ? 'Question text may contain answer-key text'
      : 'Question text may contain the answer choices'
    : w.kind === 'key'
      ? 'This choice may contain answer-key text'
      : 'This choice may contain another choice';
