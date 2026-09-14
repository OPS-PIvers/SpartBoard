import { createContext, useContext, type RefObject } from 'react';

// Ref to the enclosing DraggableWindow's `[data-draggable-window]` host element.
// DOM `.closest()` can't reach it from content rendered inside a portal (Modal,
// SettingsPanel both portal to document.body), so it's threaded via context —
// React context crosses portal boundaries even though the DOM tree doesn't.
export const WidgetHostContext =
  createContext<RefObject<HTMLElement | null> | null>(null);

export const useWidgetHostRef = (): RefObject<HTMLElement | null> | null =>
  useContext(WidgetHostContext);
