import { describe, it, expect } from 'vitest';
import {
  ensureTopLevelBlocks,
  needsBlockNormalization,
  normalizeEditorBlocks,
} from './contentEditableBlocks';
import { sanitizeQuizResponse } from './security';

const buildEditor = (html: string): HTMLDivElement => {
  const editor = document.createElement('div');
  editor.innerHTML = html;
  return editor;
};

describe('normalizeEditorBlocks — default wrapTag (div, TextWidget)', () => {
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

  it('default mode preserves existing <p> blocks (no coercion to <div>)', () => {
    const editor = buildEditor('<p>One</p><p>Two</p>');
    normalizeEditorBlocks(editor);
    expect(editor.innerHTML).toBe('<p>One</p><p>Two</p>');
  });
});

describe('normalizeEditorBlocks — wrapTag: p (WrittenResponseEditor)', () => {
  it('wraps mixed bare-text-then-<div> content into uniform <p> blocks', () => {
    // Mirrors what Chrome produces after pressing Enter in a fresh
    // contenteditable: the first line stays as bare text and subsequent
    // lines get wrapped in <div>. The fix must produce <p> for both.
    const editor = buildEditor('First line<div>Second line</div>Third line');
    normalizeEditorBlocks(editor, { wrapTag: 'p' });

    expect(editor.children.length).toBe(3);
    expect(Array.from(editor.children).every((c) => c.tagName === 'P')).toBe(
      true
    );
    expect(editor.textContent).toBe('First lineSecond lineThird line');
  });

  it('coerces existing <div> paragraph blocks to <p>', () => {
    // The naturally Chrome-produced DOM after a few Enter presses is
    // all-<div>. The sanitizer would strip those (they aren't in
    // `sanitizeQuizResponse`'s allowlist), losing paragraph structure
    // on save. Normalization to <p> preserves it round-trip.
    const editor = buildEditor('<div>One</div><div>Two</div>');
    normalizeEditorBlocks(editor, { wrapTag: 'p' });

    expect(editor.children.length).toBe(2);
    expect(Array.from(editor.children).every((c) => c.tagName === 'P')).toBe(
      true
    );
    expect(editor.textContent).toBe('OneTwo');
  });

  it('leaves already-uniform <p> blocks untouched', () => {
    const html = '<p>One</p><p>Two</p><p>Three</p>';
    const editor = buildEditor(html);
    normalizeEditorBlocks(editor, { wrapTag: 'p' });

    expect(editor.innerHTML).toBe(html);
  });

  it('preserves lists and other non-paragraph blocks', () => {
    // Lists and headings are NOT paragraph containers; coercing them
    // would destroy the user's intentional structure. Only DIV/P swap.
    const editor = buildEditor(
      '<p>Intro</p><ul><li>a</li><li>b</li></ul><div>Outro</div>'
    );
    normalizeEditorBlocks(editor, { wrapTag: 'p' });

    expect(editor.children.length).toBe(3);
    expect(editor.children[0].tagName).toBe('P');
    expect(editor.children[1].tagName).toBe('UL'); // preserved
    expect(editor.children[2].tagName).toBe('P'); // div → p
    expect((editor.children[1] as HTMLElement).innerHTML).toBe(
      '<li>a</li><li>b</li>'
    );
  });

  it('survives the sanitizeQuizResponse round trip without losing structure', () => {
    // The actual round trip the WrittenResponseEditor performs on every
    // keystroke: read innerHTML → sanitize → save. If sanitization
    // strips the wrap tag, the structural fix is useless.
    const editor = buildEditor('First line<div>Second line</div>Third line');
    normalizeEditorBlocks(editor, { wrapTag: 'p' });
    const sanitized = sanitizeQuizResponse(editor.innerHTML);

    // <p> survives, paragraph breaks survive, no <div> leaks through.
    expect(sanitized).toContain('<p>First line</p>');
    expect(sanitized).toContain('<p>Second line</p>');
    expect(sanitized).toContain('<p>Third line</p>');
    expect(sanitized).not.toContain('<div>');
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

  it('returns true when a <div> exists and wrapTag is "p"', () => {
    expect(
      needsBlockNormalization(buildEditor('<div>a</div><div>b</div>'), {
        wrapTag: 'p',
      })
    ).toBe(true);
  });

  it('returns false when all blocks already match wrapTag "p"', () => {
    expect(
      needsBlockNormalization(buildEditor('<p>a</p><p>b</p>'), {
        wrapTag: 'p',
      })
    ).toBe(false);
  });

  it('treats lists as non-paragraph blocks even with wrapTag "p"', () => {
    // A <ul> doesn't trigger coercion (it's not a paragraph), so an
    // editor containing only lists and matching <p> blocks is uniform.
    expect(
      needsBlockNormalization(buildEditor('<p>intro</p><ul><li>a</li></ul>'), {
        wrapTag: 'p',
      })
    ).toBe(false);
  });
});

describe('ensureTopLevelBlocks', () => {
  it('wraps a bare top-level text node', () => {
    const editor = buildEditor('hello world');
    ensureTopLevelBlocks(editor);
    expect(editor.children.length).toBe(1);
    expect(editor.children[0].tagName).toBe('DIV');
    expect(editor.children[0].textContent).toBe('hello world');
  });

  it('wraps a single top-level inline element', () => {
    // normalizeEditorBlocks deliberately skips this shape; ensure does not.
    const editor = buildEditor('<b>headline</b>');
    ensureTopLevelBlocks(editor);
    expect(editor.children.length).toBe(1);
    expect(editor.children[0].tagName).toBe('DIV');
    expect(editor.children[0].innerHTML).toBe('<b>headline</b>');
  });

  it('keeps text node identity after wrapping (caret/selection survival)', () => {
    // Live Ranges anchored to a moved node's *parent* collapse per
    // the DOM spec, but the text node itself survives intact — it's
    // just reparented. `toggleList` re-reads `window.getSelection()`
    // after the wrap and works with the live range's new (collapsed)
    // position, so the only thing this helper has to guarantee is
    // that the text characters are preserved verbatim and the node
    // identity stays the same.
    const editor = buildEditor('hello world');
    const textNode = editor.firstChild as Text;

    ensureTopLevelBlocks(editor);

    expect(textNode.nodeValue).toBe('hello world');
    expect(textNode.parentElement).toBe(editor.children[0]);
    expect(editor.children[0].tagName).toBe('DIV');
    expect(editor.children[0].childNodes.length).toBe(1);
    expect(editor.children[0].firstChild).toBe(textNode);
  });

  it('is a no-op when content already has block structure', () => {
    const html = '<div>One</div><div>Two</div>';
    const editor = buildEditor(html);
    ensureTopLevelBlocks(editor);
    expect(editor.innerHTML).toBe(html);
  });

  it('wraps with <p> when requested (WrittenResponseEditor mode)', () => {
    const editor = buildEditor('hello world');
    ensureTopLevelBlocks(editor, { wrapTag: 'p' });
    expect(editor.children.length).toBe(1);
    expect(editor.children[0].tagName).toBe('P');
  });

  it('handles the mixed bare-text-then-<div> case (Chrome default)', () => {
    const editor = buildEditor('First<div>Second</div>');
    ensureTopLevelBlocks(editor);
    expect(editor.children.length).toBe(2);
    expect(editor.children[0].textContent).toBe('First');
    expect(editor.children[1].textContent).toBe('Second');
  });

  it('drops top-level <br> separators', () => {
    const editor = buildEditor('a<br/>b');
    ensureTopLevelBlocks(editor);
    expect(editor.querySelector('br')).toBeNull();
    expect(editor.children.length).toBe(2);
    expect(editor.textContent).toBe('ab');
  });

  it('is a no-op on an empty editor', () => {
    const editor = buildEditor('');
    ensureTopLevelBlocks(editor);
    expect(editor.innerHTML).toBe('');
  });
});
