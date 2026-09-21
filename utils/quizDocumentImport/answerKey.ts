/**
 * Finds the answer key printed inside a test document
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D2).
 *
 * The hard part is that a key entry ("1. B") is written exactly like a
 * numbered question whose text happens to be "B". Three things separate them:
 * a key entry is a number and a single letter and nothing else, key entries
 * come in runs, and the run repeats numbers the questions already used. So the
 * key is found first and those lines are withheld from the question parser,
 * rather than the parser trying to tell them apart one line at a time.
 */

import type { DocLine } from './types';

/** `1. B`, `1) b`, `1-B`, `1: B`, `1 B` — a number and one letter, alone. */
const KEY_ENTRY = /(\d{1,3})\s*[.):\-–]?\s*([A-Fa-f])(?![A-Za-z0-9])/g;

/** A heading that names the section outright. */
const KEY_HEADING = /^\s*(answer\s*key|answers?|key)\s*:?\s*$/i;

/** Shortest run of bare entries trusted without a heading above it. */
const MIN_RUN = 3;

export interface ParsedKey {
  /** Letter by question number, uppercased. */
  letterByNumber: Map<number, string>;
  /** Indexes into the input that belong to the key, not to a question. */
  keyLineIndexes: Set<number>;
}

const EMPTY: ParsedKey = {
  letterByNumber: new Map(),
  keyLineIndexes: new Set(),
};

/**
 * Entries on one line, but only if the line is *nothing but* entries — so
 * "1. B" and "1. B 2. C 3. A" count while "1. Because the moon..." does not.
 */
export function entriesOnLine(text: string): Array<[number, string]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const found: Array<[number, string]> = [];
  let consumed = 0;
  KEY_ENTRY.lastIndex = 0;
  for (const m of trimmed.matchAll(KEY_ENTRY)) {
    found.push([Number(m[1]), m[2].toUpperCase()]);
    consumed += m[0].length;
  }
  if (found.length === 0) return [];
  // Whatever sits between entries must be separators, never words.
  const leftover = trimmed.replace(KEY_ENTRY, '').replace(/[\s,;|]/g, '');
  if (leftover.length > 0) return [];
  if (consumed === 0) return [];
  return found;
}

/**
 * The key block is the LAST run of entry-only lines in the document: a test
 * that prints its key does it at the back, and a stray "1. B" early on is not
 * a run. A run directly under an "Answer Key" heading is taken at any length.
 */
export function findAnswerKey(lines: readonly DocLine[]): ParsedKey {
  let best: {
    start: number;
    end: number;
    entries: Array<[number, string]>;
  } | null = null;

  let i = 0;
  while (i < lines.length) {
    const entries = entriesOnLine(lines[i].text);
    if (entries.length === 0) {
      i += 1;
      continue;
    }
    const start = i;
    const run: Array<[number, string]> = [];
    while (i < lines.length) {
      const more = entriesOnLine(lines[i].text);
      if (more.length === 0) break;
      run.push(...more);
      i += 1;
    }
    const headed = start > 0 && KEY_HEADING.test(lines[start - 1].text);
    if (headed || run.length >= MIN_RUN) {
      best = { start, end: i, entries: run };
    }
  }

  if (!best) return EMPTY;

  const letterByNumber = new Map<number, string>();
  for (const [n, letter] of best.entries) {
    // A repeated number means the block is not a key; keep the first.
    if (!letterByNumber.has(n)) letterByNumber.set(n, letter);
  }

  const keyLineIndexes = new Set<number>();
  for (let n = best.start; n < best.end; n += 1) keyLineIndexes.add(n);
  // The heading itself is not a question either.
  if (best.start > 0 && KEY_HEADING.test(lines[best.start - 1].text)) {
    keyLineIndexes.add(best.start - 1);
  }

  return { letterByNumber, keyLineIndexes };
}
