import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

const MIN_FIT = 0.25;
const STEPS = 7;

// Shrinks every name chip together (`--lc-fit` on the board) until the zones and the Unassigned tray fit with no scrolling.
export function useBoardFit(
  boardRef: RefObject<HTMLElement | null>,
  contentKey: string
): void {
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const fitsAt = (scale: number) => {
      board.style.setProperty('--lc-fit', String(scale));
      return (
        board.scrollHeight <= board.clientHeight + 1 &&
        board.scrollWidth <= board.clientWidth + 1
      );
    };
    const fit = () => {
      if (fitsAt(1)) return;
      let lo = MIN_FIT;
      let hi = 1;
      for (let i = 0; i < STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (fitsAt(mid)) lo = mid;
        else hi = mid;
      }
      board.style.setProperty('--lc-fit', String(lo));
    };
    fit();
    // A board resize refits now; a content resize (a swap, a new sides line) waits a frame, since refitting resizes the content.
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame);
      if (entries.some((e) => e.target === board)) fit();
      else frame = requestAnimationFrame(fit);
    });
    observer.observe(board);
    for (const child of Array.from(board.children)) observer.observe(child);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) fit();
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [boardRef, contentKey]);
}
