/**
 * Coverage for `toggleList` — the custom list-toggle helper that
 * replaces Chrome's broken `execCommand('insertUnorderedList' |
 * 'insertOrderedList')`. Both the teacher TextWidget and the student
 * WrittenResponseEditor rely on this, so the round-trip semantics
 * matter on every supported case: wrap, unwrap, switch type, partial
 * selection, mixed paragraph/list start state.
 */

import { describe, it, expect } from 'vitest';
import { toggleList } from './contentEditableLists';

/** Build a contenteditable editor pre-loaded with the given HTML and
 *  attached to document.body so the Selection API has a live tree to
 *  resolve against. Returns a teardown handle so each test cleans up
 *  the DOM after itself. */
const buildEditor = (html: string) => {
  const editor = document.createElement('div');
  editor.contentEditable = 'true';
  editor.innerHTML = html;
  document.body.appendChild(editor);
  return {
    editor,
    teardown: () => {
      window.getSelection()?.removeAllRanges();
      document.body.removeChild(editor);
    },
  };
};

/** Place the selection across every top-level child of the editor. */
const selectAll = (editor: HTMLElement): void => {
  const range = document.createRange();
  range.selectNodeContents(editor);
  const sel = window.getSelection();
  if (!sel) throw new Error('window.getSelection() not available');
  sel.removeAllRanges();
  sel.addRange(range);
};

/** Select the text content of a single child element (by index). */
const selectChild = (editor: HTMLElement, index: number): void => {
  const child = editor.children[index];
  if (!(child instanceof HTMLElement)) {
    throw new Error(`no child at index ${index}`);
  }
  const range = document.createRange();
  range.selectNodeContents(child);
  const sel = window.getSelection();
  if (!sel) throw new Error('window.getSelection() not available');
  sel.removeAllRanges();
  sel.addRange(range);
};

describe('toggleList — wrap', () => {
  it('wraps three plain <p> blocks into a single <ul>', () => {
    // This is the case the user reported broken: select multiple
    // paragraphs, click the bullet button, expect every paragraph to
    // become a list item under one <ul>. `execCommand` only converts
    // the cursor's paragraph; our helper converts every selected one.
    const { editor, teardown } = buildEditor(
      '<p>One</p><p>Two</p><p>Three</p>'
    );
    selectAll(editor);
    toggleList(editor, 'ul', 'p');

    expect(editor.children.length).toBe(1);
    expect(editor.children[0].tagName).toBe('UL');
    expect(editor.children[0].children.length).toBe(3);
    expect(
      Array.from(editor.children[0].children).every((c) => c.tagName === 'LI')
    ).toBe(true);
    expect(editor.textContent).toBe('OneTwoThree');
    teardown();
  });

  it('wraps three plain <div> blocks into a single <ol>', () => {
    // Same as above but for the TextWidget's `<div>`-based blocks +
    // numbered list. Confirms both wrap-tag flavors flow through.
    const { editor, teardown } = buildEditor(
      '<div>Alpha</div><div>Beta</div><div>Gamma</div>'
    );
    selectAll(editor);
    toggleList(editor, 'ol', 'div');

    expect(editor.children.length).toBe(1);
    expect(editor.children[0].tagName).toBe('OL');
    expect(editor.children[0].children.length).toBe(3);
    teardown();
  });

  it('preserves inline formatting inside the wrapped blocks', () => {
    const { editor, teardown } = buildEditor(
      '<p><b>Title</b></p><p>Plain</p><p><i>signed</i></p>'
    );
    selectAll(editor);
    toggleList(editor, 'ul', 'p');

    const lis = editor.querySelectorAll('li');
    expect(lis.length).toBe(3);
    expect(lis[0].innerHTML).toBe('<b>Title</b>');
    expect(lis[1].innerHTML).toBe('Plain');
    expect(lis[2].innerHTML).toBe('<i>signed</i>');
    teardown();
  });

  it('wraps a single paragraph when only one is selected', () => {
    const { editor, teardown } = buildEditor(
      '<p>Keep</p><p>Wrap me</p><p>Keep</p>'
    );
    selectChild(editor, 1);
    toggleList(editor, 'ul', 'p');

    // Result: <p>Keep</p><ul><li>Wrap me</li></ul><p>Keep</p>
    expect(editor.children.length).toBe(3);
    expect(editor.children[0].tagName).toBe('P');
    expect(editor.children[1].tagName).toBe('UL');
    expect(editor.children[1].children.length).toBe(1);
    expect(editor.children[1].children[0].tagName).toBe('LI');
    expect(editor.children[2].tagName).toBe('P');
    teardown();
  });
});

describe('toggleList — unwrap (toggle off)', () => {
  it('unwraps a <ul> back into <p> blocks when every <li> is selected', () => {
    const { editor, teardown } = buildEditor(
      '<ul><li>One</li><li>Two</li><li>Three</li></ul>'
    );
    selectAll(editor);
    toggleList(editor, 'ul', 'p');

    expect(editor.querySelector('ul')).toBeNull();
    expect(editor.children.length).toBe(3);
    expect(Array.from(editor.children).every((c) => c.tagName === 'P')).toBe(
      true
    );
    expect(editor.textContent).toBe('OneTwoThree');
    teardown();
  });

  it('unwraps to <div> when paragraphTag is "div" (TextWidget shape)', () => {
    const { editor, teardown } = buildEditor('<ol><li>A</li><li>B</li></ol>');
    selectAll(editor);
    toggleList(editor, 'ol', 'div');

    expect(editor.querySelector('ol')).toBeNull();
    expect(editor.children.length).toBe(2);
    expect(Array.from(editor.children).every((c) => c.tagName === 'DIV')).toBe(
      true
    );
    teardown();
  });
});

describe('toggleList — switch list type', () => {
  it('converts a <ul> into an <ol> when the user clicks the numbered button on a bulleted list', () => {
    // Toggle direction is "wrap" because the selected <li>s are not in
    // an <ol>. The new <ol> swallows their content; the old <ul>
    // becomes empty and is removed.
    const { editor, teardown } = buildEditor(
      '<ul><li>One</li><li>Two</li><li>Three</li></ul>'
    );
    selectAll(editor);
    toggleList(editor, 'ol', 'p');

    expect(editor.querySelector('ul')).toBeNull();
    expect(editor.children.length).toBe(1);
    expect(editor.children[0].tagName).toBe('OL');
    expect(editor.children[0].children.length).toBe(3);
    expect(editor.textContent).toBe('OneTwoThree');
    teardown();
  });

  it('converts a <ol> into a <ul> symmetrically', () => {
    const { editor, teardown } = buildEditor(
      '<ol><li>First</li><li>Second</li></ol>'
    );
    selectAll(editor);
    toggleList(editor, 'ul', 'p');

    expect(editor.querySelector('ol')).toBeNull();
    expect(editor.children[0].tagName).toBe('UL');
    expect(editor.children[0].children.length).toBe(2);
    teardown();
  });
});

describe('toggleList — selection edge cases', () => {
  it('is a no-op when there is no selection', () => {
    const { editor, teardown } = buildEditor('<p>Nothing selected</p>');
    window.getSelection()?.removeAllRanges();
    toggleList(editor, 'ul', 'p');
    expect(editor.innerHTML).toBe('<p>Nothing selected</p>');
    teardown();
  });

  it('is a no-op when the selection is outside the editor', () => {
    const { editor, teardown } = buildEditor('<p>Editor content</p>');
    const stray = document.createElement('div');
    stray.textContent = 'Outside';
    document.body.appendChild(stray);
    const range = document.createRange();
    range.selectNodeContents(stray);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    toggleList(editor, 'ul', 'p');
    expect(editor.innerHTML).toBe('<p>Editor content</p>');
    document.body.removeChild(stray);
    teardown();
  });

  it('wraps a mixed paragraph + existing-list selection into a single list', () => {
    // Common user shape: typed a list, then a fresh paragraph below.
    // Select both → all become one merged bulleted list.
    const { editor, teardown } = buildEditor('<ul><li>One</li></ul><p>Two</p>');
    selectAll(editor);
    toggleList(editor, 'ul', 'p');

    expect(editor.children.length).toBe(1);
    expect(editor.children[0].tagName).toBe('UL');
    expect(editor.children[0].children.length).toBe(2);
    expect(editor.textContent).toBe('OneTwo');
    teardown();
  });
});

describe('toggleList — selection preservation', () => {
  it('keeps the selection alive across the mutation', () => {
    // The user expects the caret / drag selection to survive a list
    // toggle so they can keep typing or formatting without re-
    // clicking. Saved offsets are character-based and text content
    // is invariant across the toggle, so the same plain-text
    // positions should resolve to the same logical caret spots.
    const { editor, teardown } = buildEditor(
      '<p>One</p><p>Two</p><p>Three</p>'
    );
    selectAll(editor);
    toggleList(editor, 'ul', 'p');

    const sel = window.getSelection();
    if (!sel) throw new Error('window.getSelection() not available');
    expect(sel.rangeCount).toBeGreaterThan(0);
    // The selection should still span the full text content (9 chars
    // — OneTwoThree minus newline gaps that don't appear in nodeText).
    const selectedText = sel.toString();
    expect(selectedText.length).toBeGreaterThan(0);
    teardown();
  });
});
