/**
 * Shared block-normalization helpers for contenteditable editors.
 *
 * Both the teacher-facing `TextWidget` and the student-facing
 * `WrittenResponseEditor` rely on `document.execCommand` for inline
 * formatting (bold/italic/underline) and on the browser's native
 * selection algorithm for drag-select. List toggling is NOT handled
 * by `execCommand` any more — it lives in `contentEditableLists.ts`
 * (`toggleList`), which both editors call directly.
 *
 * Chrome leaves the FIRST line of a contenteditable as a bare text
 * node and only wraps subsequent Enter-separated lines in `<div>`
 * blocks, producing a mixed `text<div>line</div>` structure that
 * breaks BOTH:
 *
 *  1. **Drag-selection across paragraphs** collapses at the bare-
 *     text/block boundary (Ctrl+A still works as a workaround).
 *  2. **`toggleList`** assumes top-level children are uniform
 *     block elements; bare text nodes at the top level would be
 *     skipped when collecting selected blocks.
 *
 * `normalizeEditorBlocks` rewrites the mixed structure into uniform
 * blocks. Both editor call sites run it (or `needsBlockNormalization`
 * + `normalizeEditorBlocks`) immediately before invoking `toggleList`
 * so the list helper can rely on every top-level child being a block.
 *
 * The caller picks the wrap tag — `<div>` for the TextWidget (which
 * persists `<div>` blocks via `sanitizeHtml`) or `<p>` for the
 * WrittenResponseEditor (whose `sanitizeQuizResponse` allowlist
 * permits `<p>` but strips `<div>`). When the wrap tag is `<p>`, any
 * existing top-level `<div>` blocks are also coerced to `<p>` so the
 * naturally-Chrome-produced DOM round-trips through the sanitizer
 * without losing paragraph structure. Lists and headings always keep
 * their semantic tags.
 */

/** Tags this util treats as block-level paragraph containers. */
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

export interface NormalizeOptions {
  /**
   * Tag used to wrap loose inline / text content into a block, and the
   * target tag for paragraph-block coercion. Default `'div'`.
   *
   *   - `'div'` — TextWidget. Existing `<p>` blocks are preserved as-is.
   *   - `'p'`   — WrittenResponseEditor. Existing `<div>` blocks are
   *               rewritten as `<p>` so the sanitizer doesn't strip them.
   */
  wrapTag?: 'div' | 'p';
}

/** True when an editor needs `normalizeEditorBlocks` run on it. Skips
 *  the rewrite for content that is already uniform (no work to do) and
 *  for inline-only content like `<b>headline</b>` — wrapping a single
 *  inline element would add a stray line-box.
 *
 *  Triggers a rewrite when:
 *    - a top-level `<br>` separator exists (template / Firefox-style
 *      line breaks),
 *    - a non-empty text node sits next to block siblings (Chrome's
 *      bare-first-line + `<div>`-wrapped-rest pattern), or
 *    - `wrapTag: 'p'` is requested AND a top-level `<div>` is present.
 *      The `<p>` mode is the strict normalization the
 *      WrittenResponseEditor needs because its sanitizer strips `<div>`;
 *      the default `'div'` mode is permissive and leaves existing
 *      `<p>` blocks (e.g. legacy TextWidget content) untouched.
 */
export const needsBlockNormalization = (
  editor: HTMLDivElement,
  options?: NormalizeOptions
): boolean => {
  const wrapTag = options?.wrapTag ?? 'div';
  let sawBlock = false;
  let sawNonBlock = false;
  let sawDivToCoerce = false;

  for (const child of editor.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.tagName === 'BR') return true;
      if (BLOCK_TAGS.has(el.tagName)) {
        sawBlock = true;
        // Only coerce in the strict `<p>` direction. The default
        // `<div>` mode leaves existing `<p>` blocks alone, matching
        // the historical TextWidget behavior.
        if (wrapTag === 'p' && el.tagName === 'DIV') {
          sawDivToCoerce = true;
        }
      } else {
        sawNonBlock = true;
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      if ((child.nodeValue ?? '').trim().length > 0) {
        sawNonBlock = true;
      }
    }
  }
  return (sawBlock && sawNonBlock) || sawDivToCoerce;
};

/** Wrap runs of loose top-level text/inline nodes into the configured
 *  block tag, drop top-level `<br>` separators, and coerce mismatched
 *  paragraph-block tags (`<div>` ↔ `<p>`) to match the wrap tag.
 *
 *  Mixed structures make drag-selection collapse at the boundary and
 *  break the list-insertion commands. After this pass every top-level
 *  child is either a `wrapTag` block (paragraph) or a non-paragraph
 *  block whose semantic tag was already correct (`<ul>`, `<h2>`, etc.).
 *
 *  Whitespace-only top-level text nodes are dropped rather than
 *  wrapped — they'd otherwise become stray empty paragraphs on the
 *  next normalization pass.
 *
 *  Only **moves** nodes (`appendChild`, `insertBefore`, `replaceChild`)
 *  — never clones — so any live `Range` references the caller is
 *  tracking (the user's caret, an active selection) survive per the
 *  DOM spec's node-relocation rules.
 */
export const normalizeEditorBlocks = (
  editor: HTMLDivElement,
  options?: NormalizeOptions
): void => {
  if (!needsBlockNormalization(editor, options)) return;
  wrapTopLevelContent(editor, options?.wrapTag ?? 'div');
};

/** Stronger normalization for list operations: always wraps loose top-
 *  level text/inline content into a block, even when the editor is
 *  inline-only (e.g. a single text node "hello world" the user typed
 *  without pressing Enter).
 *
 *  `normalizeEditorBlocks` deliberately skips inline-only content to
 *  avoid adding stray line-boxes for cases like `<b>headline</b>`.
 *  But `toggleList` iterates `editor.children` to find blocks to wrap
 *  into `<li>`s, and `editor.children` excludes text nodes — so when
 *  the editor has only a bare text node at the top level, the list
 *  command silently does nothing. This helper forces the wrap so the
 *  list command always has a block to act on.
 *
 *  Same node-relocation semantics as `normalizeEditorBlocks`: only
 *  moves nodes, never clones, so live Range references survive.
 */
export const ensureTopLevelBlocks = (
  editor: HTMLDivElement,
  options?: NormalizeOptions
): void => {
  wrapTopLevelContent(editor, options?.wrapTag ?? 'div');
};

const wrapTopLevelContent = (
  editor: HTMLDivElement,
  wrapTag: 'div' | 'p'
): void => {
  let pending: Node[] = [];
  const flushPending = (insertBefore: Node | null) => {
    if (pending.length === 0) return;
    const block = document.createElement(wrapTag);
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
        // Coerce existing `<div>` blocks to `<p>` when the caller
        // requested `<p>` mode (one-way coercion). The other direction
        // (`<p>` → `<div>`) is intentionally NOT performed: legacy
        // TextWidget content with `<p>` blocks should round-trip
        // unchanged through default-mode normalization. Move children
        // into the replacement so the user's caret — which sits inside
        // a text node, not the container — follows along automatically.
        if (wrapTag === 'p' && el.tagName === 'DIV') {
          const replacement = document.createElement('p');
          while (el.firstChild) replacement.appendChild(el.firstChild);
          editor.replaceChild(replacement, el);
        }
        continue;
      }
      pending.push(child);
    } else if (child.nodeType === Node.TEXT_NODE) {
      // Drop whitespace-only text nodes (typically newlines from
      // sanitized HTML); they're not paragraphs the user typed, and
      // wrapping them creates visible empty lines on the next
      // normalization pass.
      if ((child.nodeValue ?? '').trim().length === 0) {
        if (child.parentNode === editor) editor.removeChild(child);
        continue;
      }
      pending.push(child);
    }
  }
  flushPending(null);
};
