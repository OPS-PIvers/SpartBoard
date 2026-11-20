// Word bank stimulus: one choice per line, blank lines split groups; a tap fills a typed blank.
import { joinBlanks, splitBlanks } from './quizFibBlanks';

export type WordBankColumns = 1 | 2 | 3;

/** Groups of choices in the teacher's order; blank lines start a new group, repeats are dropped. */
export function parseWordBank(text: string | undefined): string[][] {
  const seen = new Set<string>();
  const groups: string[][] = [];
  let current: string[] = [];
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (current.length > 0) groups.push(current);
      current = [];
      continue;
    }
    if (seen.has(line)) continue;
    seen.add(line);
    current.push(line);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export function wordBankColumns(n: unknown): WordBankColumns {
  return n === 2 || n === 3 ? n : 1;
}

/**
 * The answer after tapping `choice`: a single blank takes the choice; with
 * several, the last blank the student was in, else the first empty one, else the first.
 */
export function fillWordBankChoice(
  value: string,
  choice: string,
  blankCount: number,
  focusedBlank: number | null
): string {
  if (blankCount < 2) return choice;
  const parts = splitBlanks(value ?? '').slice(0, blankCount);
  while (parts.length < blankCount) parts.push('');
  const empty = parts.findIndex((p) => p.trim() === '');
  const target =
    focusedBlank !== null && focusedBlank >= 0 && focusedBlank < blankCount
      ? focusedBlank
      : empty >= 0
        ? empty
        : 0;
  parts[target] = choice;
  return joinBlanks(parts);
}
