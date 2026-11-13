import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

const SIDE_WIDTHS = [26, 30, 34, 38, 42, 46, 50];
const TEXT_SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6];

// Fits every Unassigned name: widen the side column (up to half the board), then shrink the tray text.
export function useTrayFit(
  boardRef: RefObject<HTMLElement | null>,
  trayRef: RefObject<HTMLElement | null>,
  contentKey: string
): void {
  useLayoutEffect(() => {
    const board = boardRef.current;
    const tray = trayRef.current;
    if (!board || !tray) return;
    const fits = () => tray.scrollHeight <= tray.clientHeight + 1;
    const fit = () => {
      tray.style.removeProperty('--tray-scale');
      tray.style.removeProperty('--tray-w');
      if (getComputedStyle(board).flexDirection === 'row') {
        for (const pct of SIDE_WIDTHS) {
          tray.style.setProperty('--tray-w', `${pct}%`);
          if (fits()) return;
        }
      }
      for (const scale of TEXT_SCALES) {
        tray.style.setProperty('--tray-scale', String(scale));
        if (fits()) return;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(board);
    observer.observe(tray);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) fit();
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [boardRef, trayRef, contentKey]);
}
