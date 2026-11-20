// Writing peer review: find a partner's note in text that kept changing, and map plain-text offsets to the DOM.
import { editorPlainText } from '@/hooks/useInputSignals';
import { sanitizeQuizResponse } from '@/utils/security';
import type { WritingPeerMark } from '@/types';

/** Elements the reader sees but that are not the writer's text, such as a suggested insert. */
export const PEER_SKIP_ATTR = 'data-peer-skip';

/** The draft's plain text, the same text the edit log and every note offset count in. */
export function peerPlainText(html: string): string {
  if (typeof document === 'undefined') return '';
  const el = document.createElement('div');
  el.innerHTML = sanitizeQuizResponse(html);
  return editorPlainText(el);
}

/** Where `quote` sits now: the match nearest `near`, or -1 once the writer changed it. */
export function locateQuote(text: string, quote: string, near: number): number {
  if (!quote) return -1;
  let best = -1;
  let from = text.indexOf(quote);
  while (from !== -1) {
    if (best === -1 || Math.abs(from - near) < Math.abs(best - near))
      best = from;
    from = text.indexOf(quote, from + 1);
  }
  return best;
}

export interface PlacedMark extends WritingPeerMark {
  /** False once the quoted text is gone; the note still lists, unmarked. */
  placed: boolean;
}

/** Moves each note onto its quote in the current text. */
export function placeMarks(
  text: string,
  marks: readonly WritingPeerMark[]
): PlacedMark[] {
  return marks.map((m) => {
    const at = locateQuote(text, m.quote, m.start);
    return at === -1
      ? { ...m, placed: false }
      : { ...m, start: at, end: at + m.quote.length, placed: true };
  });
}

/** The smallest change a suggested edit makes, for showing it: kept text around a removed and an added part. */
export function editParts(
  quote: string,
  insert: string
): { before: string; removed: string; added: string; after: string } {
  let a = 0;
  const max = Math.min(quote.length, insert.length);
  while (a < max && quote[a] === insert[a]) a += 1;
  let b = 0;
  while (
    b < max - a &&
    quote[quote.length - 1 - b] === insert[insert.length - 1 - b]
  )
    b += 1;
  return {
    before: quote.slice(0, a),
    removed: quote.slice(a, quote.length - b),
    added: insert.slice(a, insert.length - b),
    after: quote.slice(quote.length - b),
  };
}

/** The offset into the shown plain text of a DOM point inside `root`, skipping suggested inserts. */
export function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  const frag = range.cloneContents();
  for (const skip of Array.from(frag.querySelectorAll(`[${PEER_SKIP_ATTR}]`)))
    skip.remove();
  return (frag.textContent ?? '').length;
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'PRE',
]);

/** A DOM range over plain-text offsets `start`..`end`, counted as `editorPlainText` counts them. */
export function plainRange(
  root: Node,
  start: number,
  end: number
): Range | null {
  let out = '';
  let startPt: [Node, number] | null = null;
  let endPt: [Node, number] | null = null;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const len = (child.nodeValue ?? '').length;
        if (!startPt && start >= out.length && start <= out.length + len)
          startPt = [child, start - out.length];
        if (!endPt && startPt && end >= out.length && end <= out.length + len)
          endPt = [child, end - out.length];
        out += child.nodeValue ?? '';
      } else if (child instanceof Element) {
        if (child.tagName === 'BR') {
          if (child.nextSibling || !BLOCK_TAGS.has(node.nodeName)) out += '\n';
        } else if (BLOCK_TAGS.has(child.tagName)) {
          if (out !== '' && !out.endsWith('\n')) out += '\n';
          walk(child);
          if (child.nextSibling) out += '\n';
        } else {
          walk(child);
        }
      }
    }
  };
  walk(root);
  if (!startPt || !endPt) return null;
  const range = document.createRange();
  range.setStart(...(startPt as [Node, number]));
  range.setEnd(...(endPt as [Node, number]));
  return range;
}

/** Puts a partner's accepted edit into the editor; false when its quote is no longer there. */
export function applyPeerEditToEditor(
  el: HTMLElement,
  mark: Pick<WritingPeerMark, 'start' | 'quote' | 'insert'>
): boolean {
  const text = editorPlainText(el);
  const at = locateQuote(text, mark.quote, mark.start);
  if (at === -1) return false;
  const range = plainRange(el, at, at + mark.quote.length);
  if (!range || range.toString() !== mark.quote.replace(/\n/g, ''))
    return false;
  range.deleteContents();
  if (mark.insert) range.insertNode(document.createTextNode(mark.insert));
  el.normalize();
  return true;
}
