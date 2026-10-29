import { useEffect } from 'react';

const PRINT_BLOCK_CSS = '@media print { body { display: none !important; } }';

/** Prints a blank page and swallows Ctrl/Cmd+P while enabled. */
export function usePrintBlock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const style = document.createElement('style');
    style.setAttribute('data-print-block', '');
    style.textContent = PRINT_BLOCK_CSS;
    document.head.appendChild(style);
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      style.remove();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);
}

/** Blocks copy, cut, paste and drop anywhere on the page while enabled. */
export function useClipboardBlock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const block = (e: Event) => e.preventDefault();
    const events = ['copy', 'cut', 'paste', 'drop'] as const;
    for (const type of events) document.addEventListener(type, block, true);
    return () => {
      for (const type of events)
        document.removeEventListener(type, block, true);
    };
  }, [enabled]);
}

export const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
};
export const isFullscreenNow = () => document.fullscreenElement != null;

/** Whether this browser lets a page go fullscreen; iPads and some embeds can't. */
export const fullscreenSupported = (): boolean =>
  typeof document !== 'undefined' &&
  document.fullscreenEnabled === true &&
  typeof document.documentElement.requestFullscreen === 'function';
