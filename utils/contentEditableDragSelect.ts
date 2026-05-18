/**
 * Chromium contenteditable bug workaround: drag-selection clamps to
 * the anchor text node's block when mousedown lands on text, refusing
 * to extend across block boundaries. (Padding-area clicks work fine
 * — the anchor falls on the container instead.) Firefox and Safari
 * extend correctly across blocks and do not need this workaround.
 *
 * Bubble-phase `setBaseAndExtent` overrides get re-clamped by Chromium
 * on the next pointer tick, so the only reliable fix is to suppress
 * Chromium's default drag-selection algorithm by calling
 * `e.preventDefault()` on mousedown. That also blocks the automatic
 * focus shift and caret placement, so both are re-done manually:
 * `editor.focus({ preventScroll: true })` + an empty range at the
 * click point.
 *
 * The `preventDefault` + manual focus path is gated to non-touch
 * Chromium because:
 *  - Firefox/Safari don't have the bug, so suppressing native behavior
 *    only opens us up to regressions from the polyfill path.
 *  - On touch, `mousedown` is synthesized from the tap chain;
 *    `preventDefault` there can suppress the virtual keyboard,
 *    long-press selection handles, and tap-to-caret on Android
 *    WebView. The native touch-selection path doesn't suffer the
 *    block-clamping bug, so let the browser handle it.
 *
 * The `anchor`/`isDragging` state machine still runs everywhere so
 * `setBaseAndExtent` on `mousemove` continues to extend the selection
 * — it just doesn't need to fight a non-existent re-clamp in
 * non-Chromium / touch.
 *
 * Multi-click gestures (`detail >= 2`), shift-click range extension,
 * and modifier-clicks bypass the enhancer entirely. Click events
 * still fire normally (preventDefault on mousedown doesn't suppress
 * click), so links and form controls inside the editor still respond.
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
/** True for Chromium-based browsers (Chrome, Edge, Opera, Brave, Arc,
 *  Vivaldi, …) on non-touch devices. Only those need the
 *  preventDefault-driven workaround for the drag-select clamp bug; on
 *  Firefox/Safari/mobile the native selection path works correctly
 *  and suppressing it can break virtual-keyboard / touch-selection
 *  affordances. */
const needsPreventDefaultWorkaround = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Every Chromium fork carries "Chrome/" in the UA. We don't exclude
  // Edge/Opera/etc. — they're all Blink and share the same bug.
  if (!/Chrome\//.test(ua)) return false;
  // Skip on touch primary input. `maxTouchPoints > 0` would over-fire
  // on laptops with touchscreens; `pointer: coarse` is the actual
  // signal for touch-first devices (phones, tablets).
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  ) {
    return false;
  }
  return true;
};

export const installDragSelectEnhancer = (
  editor: HTMLElement
): (() => void) => {
  const usePreventDefault = needsPreventDefaultWorkaround();
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

    if (usePreventDefault) {
      // Suppress Chromium's default drag-selection algorithm — the
      // one that clamps to the anchor text node's block — so our own
      // setBaseAndExtent on mousemove isn't re-clamped on the next
      // pointer tick. Also blocks the automatic focus shift and caret
      // placement, so both are re-done manually below.
      e.preventDefault();

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
        // setStart/setEnd throws IndexSizeError if the offset is out
        // of range (rare race after a concurrent DOM mutation). Bail
        // out — the next click will retry.
        return;
      }
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
