// D8: tells text moved inside a Writing piece apart from text brought in from outside it.
import type { WritingEditKind } from '@/utils/writingLog';

/** Where pasted or dropped text came from. */
export type InsertSource = 'inside' | 'own-unsent' | 'outside';

/** How an insert lands: the log kind it is recorded as, or null when it is blocked. */
export type InsertKind = Extract<
  WritingEditKind,
  'typed' | 'pasted' | 'restored'
> | null;

/** Clipboard text differs from the selection it came from only in spacing and line breaks. */
export const clipboardKey = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();

/** Remembers what was last copied from the piece itself and from the student's own unsent writing. */
export class InsideClipboard {
  private inside: string | null = null;
  private unsent: string | null = null;

  /** A copy or cut from the editor (`inside`) or from the unsent-writing panel (`own-unsent`). */
  noteCopy(text: string, source: Exclude<InsertSource, 'outside'>): void {
    const key = clipboardKey(text);
    if (!key) return;
    if (source === 'inside') this.inside = key;
    else this.unsent = key;
  }

  sourceOf(text: string): InsertSource {
    const key = clipboardKey(text);
    if (!key) return 'outside';
    if (key === this.inside) return 'inside';
    if (key === this.unsent) return 'own-unsent';
    // Part of the student's own unsent writing is still theirs.
    if (this.unsent !== null && key.length >= 20 && this.unsent.includes(key))
      return 'own-unsent';
    return 'outside';
  }
}

/** D8: a move inside the piece always works; outside text needs the teacher's paste setting and is logged as pasted. */
export function insertKind(
  source: InsertSource,
  allowPaste: boolean
): InsertKind {
  if (source === 'inside') return 'typed';
  if (source === 'own-unsent') return 'restored';
  return allowPaste ? 'pasted' : null;
}
