import * as Y from 'yjs';

/**
 * Caret preservation across remote edits.
 *
 * Re-rendering a textarea from a `Y.Text` resets the caret to the end, which is
 * what made the old editor feel like it was fighting you whenever a teammate
 * typed. A relative position is anchored to the character itself rather than to
 * an offset, so it survives insertions and deletions made anywhere else in the
 * document — including ones that shift everything after them.
 *
 * Capture BEFORE applying a remote update, restore after.
 */

export interface CapturedCaret {
  start: Y.RelativePosition;
  end: Y.RelativePosition;
}

export function captureCaret(
  text: Y.Text,
  el: HTMLTextAreaElement | HTMLInputElement | null
): CapturedCaret | null {
  // Only the focused field has a caret worth keeping.
  if (!el || el.ownerDocument.activeElement !== el) return null;
  const length = text.length;
  const start = Math.min(Math.max(el.selectionStart ?? 0, 0), length);
  const end = Math.min(Math.max(el.selectionEnd ?? 0, 0), length);
  return {
    start: Y.createRelativePositionFromTypeIndex(text, start),
    end: Y.createRelativePositionFromTypeIndex(text, end),
  };
}

export function restoreCaret(
  text: Y.Text,
  el: HTMLTextAreaElement | HTMLInputElement | null,
  captured: CapturedCaret | null
): void {
  if (!captured || !el) return;
  const doc = text.doc;
  if (!doc) return;
  const start = Y.createAbsolutePositionFromRelativePosition(
    captured.start,
    doc
  );
  const end = Y.createAbsolutePositionFromRelativePosition(captured.end, doc);
  // A position whose anchor was deleted out from under it resolves to null;
  // leaving the caret alone beats dropping it at zero.
  if (!start || !end) return;
  el.setSelectionRange(start.index, end.index);
}
