import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  htmlToPlainText,
  renderAnnotatedSnapshot,
  getPlainTextOffsetFromRange,
} from '@/utils/writtenAnnotations';
import type { WrittenAnswerAnnotation } from '@/types';

const ann = (
  from: number,
  to: number,
  id = 'a1',
  color: WrittenAnswerAnnotation['highlightColor'] = 'yellow'
): WrittenAnswerAnnotation => ({
  id,
  from,
  to,
  highlightColor: color,
  authorUid: 'teacher',
  createdAt: 0,
});

describe('htmlToPlainText', () => {
  it('returns empty for empty input', () => {
    expect(htmlToPlainText('')).toBe('');
  });

  it('strips inline tags and keeps text', () => {
    expect(htmlToPlainText('<b>hello</b> <i>world</i>')).toBe('hello world');
  });

  it('emits a single newline between paragraphs', () => {
    expect(htmlToPlainText('<p>one</p><p>two</p>')).toBe('one\ntwo');
  });

  it('treats <br> as a single newline', () => {
    expect(htmlToPlainText('line<br>two')).toBe('line\ntwo');
  });

  it('treats list items as newline-separated', () => {
    expect(htmlToPlainText('<ul><li>a</li><li>b</li></ul>')).toBe('a\nb');
  });
});

describe('renderAnnotatedSnapshot', () => {
  it('renders without annotations as plain DOM', () => {
    const { container } = render(
      <div>
        {renderAnnotatedSnapshot({
          html: '<p>hello <b>world</b></p>',
          annotations: [],
        })}
      </div>
    );
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('hello world');
  });

  it('wraps the annotated range in a <mark>', () => {
    // Plaintext: "hello world" → annotate "hello" (0..5)
    const { container } = render(
      <div>
        {renderAnnotatedSnapshot({
          html: '<p>hello world</p>',
          annotations: [ann(0, 5)],
        })}
      </div>
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('hello');
    expect(marks[0].getAttribute('data-annotation-id')).toBe('a1');
    expect(marks[0].getAttribute('data-color')).toBe('yellow');
  });

  it('splits a text node when an annotation covers only part of it', () => {
    const { container } = render(
      <div>
        {renderAnnotatedSnapshot({
          html: '<p>alphabet soup</p>',
          // Plaintext: "alphabet soup" — annotate "soup" (9..13).
          annotations: [ann(9, 13)],
        })}
      </div>
    );
    expect(container.querySelector('mark')?.textContent).toBe('soup');
    expect(container.textContent).toBe('alphabet soup');
  });

  it('renders marks across paragraph boundaries correctly', () => {
    // Plaintext: "abc\ndef" — annotate "c\nd" (2..5)
    const { container } = render(
      <div>
        {renderAnnotatedSnapshot({
          html: '<p>abc</p><p>def</p>',
          annotations: [ann(2, 5)],
        })}
      </div>
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThanOrEqual(1);
    const totalMarkText = Array.from(marks)
      .map((m) => m.textContent)
      .join('');
    expect(totalMarkText.replace(/\s+/g, '')).toBe('cd');
  });

  it('preserves inline styling tags around marks', () => {
    const { container } = render(
      <div>
        {renderAnnotatedSnapshot({
          html: '<p><b>bold</b> text</p>',
          annotations: [ann(0, 4)], // "bold"
        })}
      </div>
    );
    expect(container.querySelector('b')).not.toBeNull();
    expect(container.querySelector('mark')?.textContent).toBe('bold');
  });

  it('handles multiple non-overlapping annotations', () => {
    const { container } = render(
      <div>
        {renderAnnotatedSnapshot({
          html: '<p>red and blue</p>',
          // "red" (0..3), "blue" (8..12)
          annotations: [ann(0, 3, 'a1', 'pink'), ann(8, 12, 'a2', 'blue')],
        })}
      </div>
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe('red');
    expect(marks[0].getAttribute('data-color')).toBe('pink');
    expect(marks[1].textContent).toBe('blue');
    expect(marks[1].getAttribute('data-color')).toBe('blue');
  });

  it('offsets agree with htmlToPlainText (round-trip invariant)', () => {
    const html = '<p>hello <b>brave</b> new</p><p>world</p>';
    const plain = htmlToPlainText(html);
    // Annotate "brave new\nworld" — choose a non-trivial range that
    // spans an inline tag, a paragraph boundary, and lands inside the
    // second paragraph.
    const from = plain.indexOf('brave');
    const to = plain.indexOf('world') + 'world'.length;
    const { container } = render(
      <div>
        {renderAnnotatedSnapshot({
          html,
          annotations: [ann(from, to)],
        })}
      </div>
    );
    const marked = Array.from(container.querySelectorAll('mark'))
      .map((m) => m.textContent)
      .join('');
    // Newlines between blocks are NOT in marks (they're structural, not
    // text content). What matters is that the visible characters of the
    // marked range are present.
    expect(marked.replace(/\s+/g, '')).toBe('bravenewworld');
  });
});

describe('getPlainTextOffsetFromRange', () => {
  it('returns plaintext offsets for a selection inside a single text node', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>hello world</p>';
    document.body.appendChild(div);
    const p = div.querySelector('p');
    if (!p?.firstChild) throw new Error('Expected paragraph text node');
    const text = p.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 11);
    const offsets = getPlainTextOffsetFromRange(div, range);
    document.body.removeChild(div);
    expect(offsets).toEqual({ from: 6, to: 11 });
  });

  it('returns null for a collapsed range', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>x</p>';
    document.body.appendChild(div);
    const p = div.querySelector('p');
    if (!p?.firstChild) throw new Error('Expected paragraph text node');
    const text = p.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 0);
    const offsets = getPlainTextOffsetFromRange(div, range);
    document.body.removeChild(div);
    expect(offsets).toBeNull();
  });

  it('resolves element-anchored offsets across block boundaries (regression: PR #1620 review)', () => {
    // Reviewer flagged: when a Range anchors on an element node with a
    // child-index offset (e.g. clicking past the last character of a
    // paragraph), the old `childrenPlaintextLength` helper computed
    // preceding-sibling lengths in isolation and missed the `\n` that
    // joins consecutive block elements. This regression test pins the
    // integrated-walk behavior.
    const div = document.createElement('div');
    div.innerHTML = '<p>abc</p><p>def</p>';
    document.body.appendChild(div);
    // Anchor range on the outer div with startOffset=0 (before <p>abc</p>)
    // and endOffset=2 (after both <p> children). Plaintext is "abc\ndef"
    // so the expected end offset is 7 — every character + the block-
    // boundary newline.
    const range = document.createRange();
    range.setStart(div, 0);
    range.setEnd(div, 2);
    const offsets = getPlainTextOffsetFromRange(div, range);
    document.body.removeChild(div);
    expect(offsets).toEqual({ from: 0, to: 7 });
  });

  it('resolves an element-anchored offset that sits between sibling blocks', () => {
    // startOffset=1 on the outer div means "between <p>abc</p> and
    // <p>def</p>". In the integrated walk, that anchor is resolved as
    // "after the first block's text, BEFORE the boundary newline that
    // joins the next block" — i.e. offset 3, not 4. The newline only
    // exists in the plaintext projection because two blocks are
    // adjacent; the DOM has no separate "between blocks" position, so
    // we collapse the boundary onto its trailing side. Pinned here so
    // the choice is intentional, not accidental.
    const div = document.createElement('div');
    div.innerHTML = '<p>abc</p><p>def</p>';
    document.body.appendChild(div);
    const secondP = div.querySelectorAll('p')[1];
    if (!secondP?.firstChild) throw new Error('Expected second <p> text');
    const text = secondP.firstChild as Text;
    const range = document.createRange();
    range.setStart(div, 1);
    range.setEnd(text, 3);
    const offsets = getPlainTextOffsetFromRange(div, range);
    document.body.removeChild(div);
    expect(offsets).toEqual({ from: 3, to: 7 });
  });

  it('returns null when the range escapes the root', () => {
    const inside = document.createElement('div');
    inside.innerHTML = '<p>a</p>';
    const outside = document.createElement('p');
    outside.textContent = 'b';
    document.body.appendChild(inside);
    document.body.appendChild(outside);
    const insideP = inside.querySelector('p');
    if (!insideP?.firstChild) throw new Error('Expected inside text node');
    const insideText = insideP.firstChild as Text;
    const outsideText = outside.firstChild as Text;
    const range = document.createRange();
    range.setStart(insideText, 0);
    range.setEnd(outsideText, 1);
    const offsets = getPlainTextOffsetFromRange(inside, range);
    document.body.removeChild(inside);
    document.body.removeChild(outside);
    expect(offsets).toBeNull();
  });
});
