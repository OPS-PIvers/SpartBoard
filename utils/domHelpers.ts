/**
 * Returns true when a KeyboardEvent originates from an element inside a
 * DraggableWindow widget or a portaled widget dialog. Modal Escape handlers
 * should skip closing when this returns true — the Escape belongs to the
 * widget's own UI, not the outer modal.
 *
 * Two zones are recognised:
 *
 * [data-widget-portal] — portaled widget dialogs (e.g. PromptDialog).
 *   ANY element inside the portal returns true: the portal owns the entire
 *   Escape interaction regardless of which element is focused. A button-focused
 *   Escape should dismiss the dialog, not the outer modal.
 *
 * [data-draggable-window] — non-portaled widget content. Only text-input
 *   elements (INPUT / TEXTAREA / SELECT / contentEditable) return true here.
 *   Buttons inside a DraggableWindow that are not in a portal may legitimately
 *   allow outer modal Escape, so they are excluded.
 *
 * Capture-phase handlers (e.g. StarterPackConfigurationModal) must call this
 * guard directly because they fire before DraggableWindow's
 * stopImmediatePropagation. Bubble-phase handlers rely on that
 * stopImmediatePropagation for the common path.
 *
 * NOTE: returns without stopImmediatePropagation even when a capture-phase
 * caller (captureEscape=true Modal) is in use. No production caller currently
 * passes captureEscape; if one does in future, revisit whether widget-input
 * Escape should still propagate past that modal.
 */
export function isEscapeFromWidgetInput(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof Element)) return false;
  // Any element inside a portaled widget dialog — Escape belongs to the dialog.
  if (t.closest('[data-widget-portal]')) return true;
  // For non-portaled widget elements, only text inputs need protection.
  return (
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      !!(t as HTMLElement).isContentEditable) &&
    !!t.closest('[data-draggable-window]')
  );
}
