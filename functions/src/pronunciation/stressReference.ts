// Accepted primary stress per R1-R5 (scripts/spikes/stress-reference/DECISIONS.md), as 0-based syllable indices in the model's nucleus space.
import type { SpeakLanguage } from './types';

/** One source's reading: 1-based primary syllables, as the spikes and `tokenizeIpa` count them. */
export interface StressReading {
  syllableCount: number;
  primary: number[];
}

export interface StressDerivation {
  stress: number[];
  /** R1/R5: the teacher should confirm before stress is judged. */
  flagged: boolean;
}

const dedupe = (xs: number[]): number[] =>
  [...new Set(xs)].sort((a, b) => a - b);
const toZeroBased = (xs: number[]): number[] => dedupe(xs).map((i) => i - 1);

/** R1 + R4 + R5 from the spike's `deriveReference`, after the tokenizer has already refused `?` (R1b). */
export function deriveStress(
  language: SpeakLanguage,
  espeak: StressReading,
  crossCheck?: StressReading | null
): StressDerivation {
  const n = espeak.syllableCount;
  if (n <= 1) return { stress: n === 1 ? [0] : [], flagged: false };
  // R5: Spanish -mente takes both; en/de multi-marks are mostly mishandled initialisms.
  if (espeak.primary.length > 1)
    return { stress: toZeroBased(espeak.primary), flagged: language !== 'es' };
  // A polysyllable with no mark at all asserts nothing.
  if (espeak.primary.length === 0) return { stress: [], flagged: false };
  const primary = espeak.primary[0];
  if (!crossCheck || crossCheck.syllableCount !== n)
    return { stress: [primary - 1], flagged: false };
  const cc = dedupe(crossCheck.primary).filter((i) => i >= 1 && i <= n);
  if (cc.length === 0 || (cc.length === 1 && cc[0] === primary))
    return { stress: [primary - 1], flagged: false };
  // R1: keep both readings so no correct dialect is penalised, and flag it.
  return { stress: toZeroBased([primary, ...cc]), flagged: true };
}

const STRONG = new Set([...'aeoáéó']);
const WEAK = new Set([...'iuíúü']);
const ACCENTED = new Set([...'áéíóú']);

/** R3: Spanish stress from spelling alone (the spike's `measure/spanish.py`); null when the word has no vowel. */
export function spanishSpellingStress(word: string): StressReading | null {
  const w = [...word.normalize('NFC').toLowerCase()];
  const nuclei: boolean[] = [];
  let i = 0;
  while (i < w.length) {
    if (!STRONG.has(w[i]) && !WEAK.has(w[i])) {
      i++;
      continue;
    }
    let j = i;
    let accent = ACCENTED.has(w[i]);
    while (j + 1 < w.length && (STRONG.has(w[j + 1]) || WEAK.has(w[j + 1]))) {
      const a = w[j];
      const b = w[j + 1];
      // An accented weak vowel never fuses (país, día); two strong vowels are a hiatus.
      if (b === 'í' || b === 'ú' || a === 'í' || a === 'ú') break;
      if (STRONG.has(a) && STRONG.has(b)) break;
      j++;
      if (ACCENTED.has(w[j])) accent = true;
    }
    nuclei.push(accent);
    i = j + 1;
  }
  if (nuclei.length === 0) return null;
  const accented = nuclei.indexOf(true);
  if (accented >= 0)
    return { syllableCount: nuclei.length, primary: [accented + 1] };
  if (nuclei.length === 1) return { syllableCount: 1, primary: [1] };
  const last = w[w.length - 1];
  const penultimate = 'aeiouáéíóúns'.includes(last);
  return {
    syllableCount: nuclei.length,
    primary: [penultimate ? nuclei.length - 1 : nuclei.length],
  };
}
