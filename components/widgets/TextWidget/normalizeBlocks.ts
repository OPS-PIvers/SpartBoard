/** Tags this widget treats as block-level paragraph containers. Matches the
 *  set the formatting toolbar's `rangeSpansMultipleBlocks` helper checks
 *  when deciding whether execCommand will silently fail across paragraphs. */
const BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'PRE',
]);

/** True when an editor needs `normalizeEditorBlocks` run on it. Skips the
 *  rewrite for content that is already a clean run of blocks (no work to do)
 *  and for inline-only content like `<b>headline</b>` — wrapping a single
 *  inline element in a <div> would add a stray line-box, which can shift
 *  baselines and break tight centered layouts where the author specifically
 *  wanted a one-line headline.
 *
 *  The trigger is a *mixed* structure: top-level <br> separators (used by the
 *  built-in templates), a non-empty text node sitting next to block siblings
 *  (Chrome's bare-first-line + <div>-wrapped-rest pattern), or whitespace
 *  text between blocks that the browser will treat as an extra paragraph. */
export const needsBlockNormalization = (editor: HTMLDivElement): boolean => {
  let sawBlock = false;
  let sawNonBlock = false;

  for (const child of editor.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.tagName === 'BR') return true;
      if (BLOCK_TAGS.has(el.tagName)) {
        sawBlock = true;
      } else {
        sawNonBlock = true;
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      if ((child.nodeValue ?? '').trim().length > 0) {
        sawNonBlock = true;
      }
    }
  }
  return sawBlock && sawNonBlock;
};

/** Wrap runs of loose top-level text/inline nodes into <div> paragraphs so
 *  the editor's structure is uniform.
 *
 *  Mixed structures — a bare first-line text node followed by <div>-wrapped
 *  paragraphs (Chrome's default after pressing Enter), or template content
 *  using <br> line breaks — make drag-selection feel broken: highlighting
 *  past the bare-text/block boundary collapses or stops at the end of the
 *  first line. Making every line a block lets the browser treat selection
 *  consistently across the whole editor.
 *
 *  Whitespace-only text nodes (e.g. newlines between sanitized HTML tags)
 *  are dropped rather than wrapped, otherwise they'd become stray empty
 *  paragraphs after re-saves. */
export const normalizeEditorBlocks = (editor: HTMLDivElement): void => {
  if (!needsBlockNormalization(editor)) return;

  let pending: Node[] = [];
  const flushPending = (insertBefore: Node | null) => {
    if (pending.length === 0) return;
    const block = document.createElement('div');
    for (const node of pending) {
      block.appendChild(node);
    }
    editor.insertBefore(block, insertBefore);
    pending = [];
  };

  for (const child of Array.from(editor.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.tagName === 'BR') {
        flushPending(child);
        if (child.parentNode === editor) editor.removeChild(child);
        continue;
      }
      if (BLOCK_TAGS.has(el.tagName)) {
        flushPending(child);
        continue;
      }
      pending.push(child);
    } else if (child.nodeType === Node.TEXT_NODE) {
      // Drop whitespace-only text nodes (typically newlines from sanitized
      // HTML); they're not paragraphs the user typed and wrapping them
      // creates visible empty lines on the next normalization pass.
      // The node must be physically removed from the editor as well —
      // skipping `pending.push` alone leaves it sitting between blocks,
      // which is the exact mixed-content shape this helper exists to
      // eliminate.
      if ((child.nodeValue ?? '').trim().length === 0) {
        if (child.parentNode === editor) editor.removeChild(child);
        continue;
      }
      pending.push(child);
    }
  }
  flushPending(null);
};
