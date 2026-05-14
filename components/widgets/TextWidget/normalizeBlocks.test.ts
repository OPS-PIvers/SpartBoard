import { describe, it, expect } from 'vitest';
import {
  needsBlockNormalization,
  normalizeEditorBlocks,
} from './normalizeBlocks';

const buildEditor = (html: string): HTMLDivElement => {
  const editor = document.createElement('div');
  editor.innerHTML = html;
  return editor;
};

describe('normalizeEditorBlocks', () => {
  it('wraps mixed bare-text-then-<div> content into uniform <div> blocks', () => {
    const editor = buildEditor('First line<div>Second line</div>Third line');
    normalizeEditorBlocks(editor);

    expect(editor.children.length).toBe(3);
    expect(Array.from(editor.children).every((c) => c.tagName === 'DIV')).toBe(
      true
    );
    expect(editor.textContent).toBe('First lineSecond lineThird line');
  });

  it('converts top-level <br> separators into <div> paragraphs', () => {
    const editor = buildEditor('First line<br/>Second line<br/>Third line');
    normalizeEditorBlocks(editor);

    expect(editor.querySelector('br')).toBeNull();
    expect(editor.children.length).toBe(3);
    expect(editor.textContent).toBe('First lineSecond lineThird line');
  });

  it('drops whitespace-only top-level text nodes instead of wrapping them', () => {
    // Sanitized HTML often has newlines between tags. Wrapping them would
    // create stray empty paragraph blocks that the user can see as blank
    // lines in the widget.
    const editor = buildEditor('<div>First</div>\n  <div>Second</div>');
    normalizeEditorBlocks(editor);

    expect(editor.children.length).toBe(2);
    expect(editor.textContent?.replace(/\s+/g, '')).toBe('FirstSecond');
    // No empty <div> should have been inserted between the two blocks.
    expect(
      Array.from(editor.children).every((c) => (c.textContent ?? '').length > 0)
    ).toBe(true);
  });

  it('leaves inline-only content untouched (no spurious <div> wrap)', () => {
    // A widget configured for a one-line bold headline must not gain a
    // wrapping <div> — the extra line-box can shift baselines and break
    // tight centered layouts the author intentionally created.
    const editor = buildEditor('<b>Bold headline</b>');
    normalizeEditorBlocks(editor);

    expect(editor.innerHTML).toBe('<b>Bold headline</b>');
  });

  it('leaves already-uniform block content untouched', () => {
    const html = '<div>One</div><div>Two</div><div>Three</div>';
    const editor = buildEditor(html);
    normalizeEditorBlocks(editor);

    expect(editor.innerHTML).toBe(html);
  });

  it('is a no-op on an empty editor', () => {
    const editor = buildEditor('');
    normalizeEditorBlocks(editor);
    expect(editor.innerHTML).toBe('');
  });

  it('preserves nested inline structure (links/bold) inside wrapped lines', () => {
    const editor = buildEditor(
      '<b>Title</b><br/>See <a href="https://example.com">here</a><br/><i>signed</i>'
    );
    normalizeEditorBlocks(editor);

    expect(editor.children.length).toBe(3);
    expect(editor.children[0].innerHTML).toBe('<b>Title</b>');
    expect(editor.children[1].innerHTML).toBe(
      'See <a href="https://example.com">here</a>'
    );
    expect(editor.children[2].innerHTML).toBe('<i>signed</i>');
  });
});

describe('needsBlockNormalization', () => {
  it('returns false for uniform-block content', () => {
    expect(
      needsBlockNormalization(buildEditor('<div>a</div><div>b</div>'))
    ).toBe(false);
  });

  it('returns false for inline-only content', () => {
    expect(needsBlockNormalization(buildEditor('<b>hi</b>'))).toBe(false);
  });

  it('returns true for top-level <br>', () => {
    expect(needsBlockNormalization(buildEditor('a<br/>b'))).toBe(true);
  });

  it('returns true for bare text followed by a block', () => {
    expect(needsBlockNormalization(buildEditor('a<div>b</div>'))).toBe(true);
  });

  it('treats whitespace-only text nodes as not-meaningful', () => {
    // Whitespace between blocks (newlines from sanitized HTML) should not
    // trigger normalization — there's nothing real to wrap.
    expect(
      needsBlockNormalization(buildEditor('<div>a</div>\n  <div>b</div>'))
    ).toBe(false);
  });
});
