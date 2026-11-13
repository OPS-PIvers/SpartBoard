import { useEffect, useState } from 'react';
import { Z_INDEX } from '@/config/zIndex';

type Box = { x: number; y: number; w: number; h: number };

const isDialogLayer = (el: Element): el is HTMLElement =>
  el instanceof HTMLElement &&
  el.closest('[data-tour-ignore]') === null &&
  el.querySelector('[data-tour-keep-layer]') === null &&
  (el.dataset.tourDialogLift !== undefined ||
    getComputedStyle(el).zIndex === String(Z_INDEX.dialog));

// The visible panel: an inner dialog, else the last child (backdrop buttons and close icons come first).
const panelOf = (el: HTMLElement): Element =>
  el.querySelector('[role="dialog"]') ?? el.lastElementChild ?? el;

const panelBox = (el: HTMLElement): Box | null => {
  const r = panelOf(el).getBoundingClientRect();
  return r.width > 0 && r.height > 0
    ? { x: r.x, y: r.y, w: r.width, h: r.height }
    : null;
};

const sameBoxes = (a: Box[], b: Box[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.x === b[i].x && r.y === b[i].y && r.w === b[i].w && r.h === b[i].h
  );

/** While a tour runs, app dialogs drop under its callout (above its dim) and their panels become obstacles for the tip. */
export function useDialogLift(active: boolean): Box[] {
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const lifted = new Map<HTMLElement, string>();
    let frame = 0;
    let settle = 0;
    const sizes =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => queue());
    const scan = () => {
      frame = 0;
      const layers = Array.from(document.body.children).filter(isDialogLayer);
      for (const el of layers) {
        if (lifted.has(el)) continue;
        lifted.set(el, el.style.zIndex);
        el.dataset.tourDialogLift = '';
        el.style.zIndex = String(Z_INDEX.tourLift);
        sizes?.observe(panelOf(el));
      }
      for (const el of lifted.keys()) {
        if (el.isConnected) continue;
        lifted.delete(el);
        sizes?.unobserve(panelOf(el));
      }
      const next = layers.flatMap((el) => panelBox(el) ?? []);
      setBoxes((cur) => (sameBoxes(cur, next) ? cur : next));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    // Panels zoom in, so measure again once they settle.
    const changed = () => {
      queue();
      window.clearTimeout(settle);
      settle = window.setTimeout(queue, 250);
    };
    changed();
    const observer = new MutationObserver(changed);
    observer.observe(document.body, { childList: true });
    window.addEventListener('resize', queue);
    return () => {
      observer.disconnect();
      sizes?.disconnect();
      window.removeEventListener('resize', queue);
      window.clearTimeout(settle);
      if (frame) cancelAnimationFrame(frame);
      for (const [el, prev] of lifted) {
        el.style.zIndex = prev;
        delete el.dataset.tourDialogLift;
      }
    };
  }, [active]);
  return active ? boxes : [];
}
