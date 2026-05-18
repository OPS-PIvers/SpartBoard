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
 * This util installs a small drag-enhancer on a contenteditable
 * element. While the user is dragging the left mouse button, it
 * recomputes the selection on every `mousemove` using
 * `caretPositionFromPoint` and applies it via
 * `Selection.setBaseAndExtent`. That overrides Chrome's broken
 * text-node-anchored extension with a fresh selection computed from
 * the pointer's actual position — so the selection always reaches
 * wherever the pointer is, regardless of where the drag started.
 *
 * Double-click word selection, triple-click paragraph selection,
 * shift-click range extension, and pure caret clicks (no drag) all
 * bypass the enhancer so the browser's existing behavior keeps
 * working for those gestures.
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
 * Listens for `mousedown` on the editor (to capture the drag anchor)
 * and `mousemove` / `mouseup` on `document` so the drag continues to
 * track even when the pointer leaves the editor's box.
 */
export const installDragSelectEnhancer = (
  editor: HTMLElement
): (() => void) => {
  let anchor: CaretPosition | null = null;

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

    const pos = caretPositionFromPoint(e.clientX, e.clientY);
    if (!pos) return;
    // Confirm the resolved caret position lives inside the editor —
    // a click on the editor's border padding can resolve to a node
    // outside (e.g. the editor's parent). Without this guard the
    // first `setBaseAndExtent` would throw `IndexSizeError`.
    if (!editor.contains(pos.node)) return;
    anchor = pos;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!anchor) return;
    // `e.buttons` is 0 when no button is held. A mouseup may have
    // happened off-window without firing on our listener (e.g. the
    // user released over a portal'd modal that swallows events).
    if (e.buttons === 0) {
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
