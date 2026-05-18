/**
 * Chrome bug workaround: drag-selection inside contenteditable refuses
 * to extend across block boundaries when the initial `mousedown` lands
 * on a text node.
 *
 * Concrete symptom: in a multi-paragraph editor, if the user begins a
 * drag-selection by clicking on the first character of a line, the
 * selection clamps to that single block — even if the user drags the
 * pointer well past the next paragraph. Starting the same drag from
 * editor padding / whitespace (off any text node) works fine, because
 * the browser anchors the selection to the block container instead
 * of the text node.
 *
 * Prior attempts that listened for `mousemove` and called
 * `setBaseAndExtent` from a bubble-phase listener did not work in
 * Chromium: the browser's internal drag-selection logic clamps the
 * selection as part of mousedown's default action / native input
 * pipeline, and bubble-phase JS overrides get re-clamped on the next
 * pointer tick. The only reliable fix is to suppress Chromium's
 * default drag-selection algorithm entirely by calling
 * `e.preventDefault()` on the initial `mousedown`, then drive the
 * selection ourselves on `mousemove` / `mouseup`.
 *
 * `preventDefault` on mousedown also suppresses the browser's
 * automatic focus shift and caret placement, so we re-do both
 * manually:
 *   1. `editor.focus({ preventScroll: true })` so the editor's
 *      `onFocus` handler still fires and key events route correctly.
 *   2. `selection.removeAllRanges()` + `addRange(...)` to position
 *      the caret at the click point.
 *
 * Double-click word selection, triple-click paragraph selection,
 * shift-click range extension, and modifier-clicks all bypass the
 * enhancer so the browser's existing behavior keeps working for
 * those gestures. Click events still fire as normal (preventDefault
 * on mousedown doesn't suppress click), so links and form controls
 * inside the editor still respond.
 */

interface CaretPosition {
  node: Node;
  offset: number;
}

interface CaretPositionAPI {
  caretPositionFromPoint?: (
    x: number,
    y: number
  ) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

const caretPositionFromPoint = (x: number, y: number): CaretPosition | null => {
  const api = document as Document & CaretPositionAPI;
  // Spec-compliant API (Firefox, Safari, recent Chromium).
  if (typeof api.caretPositionFromPoint === 'function') {
    const pos = api.caretPositionFromPoint(x, y);
    if (pos) return { node: pos.offsetNode, offset: pos.offset };
  }
  // Older Chromium / WebKit fallback. Returns a Range whose start is
  // the caret position.
  if (typeof api.caretRangeFromPoint === 'function') {
    const range = api.caretRangeFromPoint(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
};

/**
 * Install the drag-select enhancer on a contenteditable element.
 * Returns a cleanup function that removes the installed listeners.
 *
 * Listens for `mousedown` on the editor (to capture the drag anchor
 * and suppress the browser's broken default drag-select), and
 * `mousemove` / `mouseup` on `document` so the drag continues to
 * track even when the pointer leaves the editor's box.
 */
export const installDragSelectEnhancer = (
  editor: HTMLElement
): (() => void) => {
  let anchor: CaretPosition | null = null;
  let isDragging = false;

  const onMouseDown = (e: MouseEvent) => {
    // Left button only.
    if (e.button !== 0) return;
    // `detail >= 2` means a double/triple-click. The browser's own
    // word/paragraph selection logic handles those correctly; the
    // bug we're working around only applies to plain drag-selects.
    if (e.detail >= 2) return;
    // Shift-click extends an existing selection — Chrome handles that
    // path correctly. Same for modifier-clicks (rect-select on Mac,
    // column-select on Windows): leave them to the browser.
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;

    const target = e.target;
    if (!(target instanceof Node)) return;
    if (!editor.contains(target)) return;

    // Don't intercept clicks on interactive descendants (links, form
    // controls). preventDefault would suppress their default actions
    // and break expected behavior like following a link.
    if (target instanceof Element) {
      if (target.closest('a, input, textarea, select, button')) return;
    }

    const pos = caretPositionFromPoint(e.clientX, e.clientY);
    if (!pos) return;
    // Confirm the resolved caret position lives inside the editor —
    // a click on the editor's border padding can resolve to a node
    // outside (e.g. the editor's parent). Without this guard the
    // first `setBaseAndExtent` would throw `IndexSizeError`.
    if (!editor.contains(pos.node)) return;

    // Suppress the browser's default drag-selection algorithm — the
    // one that clamps to the anchor text node's block — so our own
    // setBaseAndExtent on mousemove takes hold without being
    // re-clamped on the next pointer tick.
    e.preventDefault();

    // preventDefault also blocks the automatic focus shift onto the
    // editor and the automatic caret placement, so re-do both
    // manually. Without this, the editor's `onFocus` never fires
    // (the TextWidget needs it to mark the widget as selected and
    // clear placeholder content) and the caret doesn't render.
    if (document.activeElement !== editor) {
      editor.focus({ preventScroll: true });
    }

    const sel = window.getSelection();
    if (!sel) return;
    try {
      const range = document.createRange();
      range.setStart(pos.node, pos.offset);
      range.setEnd(pos.node, pos.offset);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // setStart/setEnd can throw IndexSizeError if the offset is out
      // of range for the node (rare race after a concurrent DOM
      // mutation). Bail out — the next click will retry.
      return;
    }

    anchor = pos;
    isDragging = true;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging || !anchor) return;
    // `e.buttons` is 0 when no button is held. A mouseup may have
    // happened off-window without firing on our listener (e.g. the
    // user released over a portal'd modal that swallows events).
    if (e.buttons === 0) {
      isDragging = false;
      anchor = null;
      return;
    }
    const pos = caretPositionFromPoint(e.clientX, e.clientY);
    if (!pos) return;
    if (!editor.contains(pos.node)) return;

    const sel = window.getSelection();
    if (!sel) return;
    try {
      sel.setBaseAndExtent(anchor.node, anchor.offset, pos.node, pos.offset);
    } catch {
      // `setBaseAndExtent` throws if either offset is out of range
      // for its node (rare race after a concurrent DOM mutation).
      // The next mousemove will retry from a fresh caret position.
    }
  };

  const onMouseUp = () => {
    isDragging = false;
    anchor = null;
  };

  editor.addEventListener('mousedown', onMouseDown);
  // `mousemove` and `mouseup` go on `document` so the drag keeps
  // tracking when the pointer leaves the editor's rectangle (which
  // happens routinely on multi-paragraph drags).
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  return () => {
    editor.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
};
