/** Shared parsing for the paired "first names" / "last names" custom roster boxes. */

const NAME_SUFFIXES = new Set([
  'jr',
  'jr.',
  'sr',
  'sr.',
  'ii',
  'iii',
  'iv',
  'v',
]);

/** Split one pasted line into a first-name part and a last-name part. */
export function splitNameLine(line: string): { first: string; last: string } {
  const trimmed = line.trim();
  if (!trimmed) return { first: '', last: '' };

  // "Smith, John" — a comma followed by a space means the last name leads.
  const inverted = /^([^,]+),\s+(.+)$/.exec(trimmed);
  if (inverted) {
    return { first: inverted[2].trim(), last: inverted[1].trim() };
  }

  const parts = trimmed.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? '', last: '' };

  const suffix =
    parts.length > 2 &&
    NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase());
  const lastCount = suffix ? 2 : 1;
  return {
    first: parts.slice(0, parts.length - lastCount).join(' '),
    last: parts.slice(parts.length - lastCount).join(' '),
  };
}

/**
 * Pair the two boxes by line number. Lines are never compacted first: a student
 * with no last name must not pull every later last name up a row.
 */
export function combineRosterNames(
  firstNames: string,
  lastNames: string
): string[] {
  const firsts = firstNames.split('\n');
  const lasts = lastNames.split('\n');
  const count = Math.max(firsts.length, lasts.length);
  const combined: string[] = [];
  for (let i = 0; i < count; i++) {
    const name =
      `${(firsts[i] ?? '').trim()} ${(lasts[i] ?? '').trim()}`.trim();
    if (name) combined.push(name);
  }
  return combined;
}

export interface PastedNameSplit {
  /** Clipboard text dropped into the first-names box. */
  pasted: string;
  /** Current contents of the first-names box. */
  value: string;
  /** Current contents of the last-names box. */
  lastNames: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Rewrite a "First Last" paste into both boxes, or return null to let the
 * paste land untouched. Only the pasted lines are re-split; lines already in
 * the box keep their text and their existing last name.
 */
export function splitPastedNames(
  input: PastedNameSplit
): { firstNames: string; lastNames: string } | null {
  const pasted = input.pasted.replace(/\r\n?/g, '\n');
  const pastedLines = pasted.split('\n');
  if (!pastedLines.some((line) => splitNameLine(line).last)) return null;

  const before = input.value.slice(0, input.selectionStart);
  const after = input.value.slice(input.selectionEnd);
  const nextLines = (before + pasted + after).split('\n');
  const oldLines = input.value.split('\n');
  const oldLasts = input.lastNames.split('\n');

  // The paste occupies new lines [pasteStart, pasteEnd]; everything outside is
  // untouched text whose last name still lives at its own row.
  const pasteStart = before.split('\n').length - 1;
  const pasteEnd = pasteStart + pastedLines.length - 1;
  const shift = nextLines.length - oldLines.length;

  const firsts: string[] = [];
  const lasts: string[] = [];
  nextLines.forEach((line, i) => {
    // Rows outside the paste, and the two rows the paste merges into, keep the
    // last name they already had.
    const oldIndex =
      i >= pasteEnd ? i - shift : i <= pasteStart ? i : undefined;
    const carried =
      oldIndex === undefined ? '' : (oldLasts[oldIndex] ?? '').trim();
    if (i < pasteStart || i > pasteEnd) {
      firsts.push(line);
      lasts.push(carried);
      return;
    }
    const { first, last } = splitNameLine(line);
    firsts.push(first);
    lasts.push(last || carried);
  });

  return { firstNames: firsts.join('\n'), lastNames: lasts.join('\n') };
}
