import { createContext, useContext, type RefObject } from 'react';

// Threaded via context (not DOM `.closest()`) so it still resolves for content rendered inside a portal, e.g. Modal/SettingsPanel.
export const WidgetHostContext =
  createContext<RefObject<HTMLElement | null> | null>(null);

export const useWidgetHostRef = (): RefObject<HTMLElement | null> | null =>
  useContext(WidgetHostContext);
