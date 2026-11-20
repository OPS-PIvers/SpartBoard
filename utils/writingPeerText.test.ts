import { describe, expect, it } from 'vitest';
import { editorPlainText } from '@/hooks/useInputSignals';
import {
  applyPeerEditToEditor,
  editParts,
  locateQuote,
  peerPlainText,
  placeMarks,
  plainRange,
  textOffset,
  PEER_SKIP_ATTR,
} from './writingPeerText';
import type { WritingPeerMark } from '@/types';

const HTML = '<p>One cat sat.</p><p>Two cat <b>ran</b> off.</p>';

const mark = (
  quote: string,
  start: number,
  insert?: string
): WritingPeerMark => ({
  id: 'm',
  by: 'p',
  kind: insert === undefined ? 'comment' : 'edit',
  start,
  end: start + quote.length,
  quote,
  insert,
  status: 'open',
  createdAt: 1,
});

const editor = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('writing peer text', () => {
  it('reads plain text the way the editor counts it', () => {
    expect(peerPlainText(HTML)).toBe(editorPlainText(editor(HTML)));
  });

  it('finds the copy of a quote nearest where it was', () => {
    const text = 'cat and cat and cat';
    expect(locateQuote(text, 'cat', 9)).toBe(8);
    expect(locateQuote(text, 'dog', 0)).toBe(-1);
    expect(locateQuote(text, '', 0)).toBe(-1);
  });

  it('moves notes onto their quote and flags ones whose text is gone', () => {
    const text = 'Added first. One cat sat.';
    const [moved, gone] = placeMarks(text, [mark('cat', 4), mark('dog', 0)]);
    expect(moved).toMatchObject({ start: 17, end: 20, placed: true });
    expect(gone.placed).toBe(false);
  });

  it('shows the smallest change in a suggested edit', () => {
    expect(editParts('hood of the car', 'hood of our car')).toEqual({
      before: 'hood of ',
      removed: 'the',
      added: 'our',
      after: ' car',
    });
    expect(editParts('a word', 'a good word')).toMatchObject({
      removed: '',
      added: 'good ',
    });
  });

  it('maps plain offsets to a DOM range across paragraphs and tags', () => {
    const el = editor(HTML);
    const text = editorPlainText(el);
    const start = text.indexOf('cat ran');
    const range = plainRange(el, start, start + 'cat ran'.length);
    expect(range?.toString()).toBe('cat ran');
  });

  it('counts a DOM point without the shown suggestions', () => {
    const el = editor(
      `<span>ab</span><ins ${PEER_SKIP_ATTR}>XYZ</ins><span>cd</span>`
    );
    const cd = el.lastChild?.firstChild;
    if (!cd) throw new Error('missing text');
    expect(textOffset(el, cd, 1)).toBe(3);
  });

  it('applies an accepted edit in place', () => {
    const el = editor(HTML);
    const text = editorPlainText(el);
    const ok = applyPeerEditToEditor(
      el,
      mark('Two cat', text.indexOf('Two cat'), 'Two dogs')
    );
    expect(ok).toBe(true);
    expect(el.innerHTML).toBe(
      '<p>One cat sat.</p><p>Two dogs <b>ran</b> off.</p>'
    );
  });

  it('refuses an edit whose text has changed', () => {
    const el = editor(HTML);
    expect(applyPeerEditToEditor(el, mark('Three cat', 14, 'x'))).toBe(false);
    expect(el.innerHTML).toBe(HTML);
  });
});
