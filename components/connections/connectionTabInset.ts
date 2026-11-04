import type { RefCallback } from 'react';

/** Width of the connection corner tab on the enclosing widget, or 0px when it has none. */
export const CONNECTION_TAB_W = 'var(--connection-tab-w, 0px)';

/** Right padding that keeps a header's own `base` gap and also clears the connection corner tab. */
export const clearConnectionTab = (base: string | number = '0px'): string =>
  `calc(${typeof base === 'number' ? `${base}px` : base} + ${CONNECTION_TAB_W})`;

/** Publishes the tab's live size on its widget window so headers inside can step clear of it. */
export const publishConnectionTabSize: RefCallback<HTMLElement> = (el) => {
  const host = el?.parentElement;
  if (!el || !host) return;
  const write = () => {
    host.style.setProperty('--connection-tab-w', `${el.offsetWidth}px`);
    host.style.setProperty('--connection-tab-h', `${el.offsetHeight}px`);
  };
  write();
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(write);
  observer?.observe(el);
  return () => {
    observer?.disconnect();
    host.style.removeProperty('--connection-tab-w');
    host.style.removeProperty('--connection-tab-h');
  };
};
