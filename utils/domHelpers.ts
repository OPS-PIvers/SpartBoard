/**
 * Returns true when a KeyboardEvent originates from a text-input element
 * inside a DraggableWindow widget. Modal Escape handlers should skip closing
 * when this returns true — the user is cancelling an inline widget edit, not
 * dismissing the modal.
 *
 * Note: capture-phase handlers fire before DraggableWindow's
 * stopImmediatePropagation, so they MUST use this guard directly.
 * Bubble-phase document/window handlers rely on stopImmediatePropagation in
 * the normal path, but need this guard for the edge case where a widget's own
 * React onKeyDown stops synthetic propagation before DraggableWindow fires.
 */
export function isEscapeFromWidgetInput(e: KeyboardEvent): boolean {
  const t = e.target;
  return (
    t instanceof Element &&
    !!t.closest('[data-draggable-window]') &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      (t as HTMLElement).isContentEditable)
  );
}
