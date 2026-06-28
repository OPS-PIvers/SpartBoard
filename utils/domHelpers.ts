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
 *
 * Portaled widget dialogs (inputs rendered via createPortal to document.body)
 * are outside the [data-draggable-window] DOM subtree, so they must add
 * data-widget-portal="" to their portal root element to be covered by this
 * guard. This avoids a native-capture ordering problem: capture-phase handlers
 * (e.g. StarterPackConfigurationModal) fire before React's synthetic onKeyDown,
 * so adding e.nativeEvent.stopImmediatePropagation() in a React handler is too
 * late. Instead, those dialogs add data-widget-portal so this guard returns
 * true, causing capture-phase callers to return before stopImmediatePropagation.
 * (DraggableWindow's own title-edit input, portaled but DraggableWindow-owned,
 * still uses e.nativeEvent.stopImmediatePropagation() at the source.)
 */
export function isEscapeFromWidgetInput(e: KeyboardEvent): boolean {
  const t = e.target;
  return (
    t instanceof Element &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      (t as HTMLElement).isContentEditable) &&
    (!!t.closest('[data-draggable-window]') ||
      !!t.closest('[data-widget-portal]'))
  );
}
