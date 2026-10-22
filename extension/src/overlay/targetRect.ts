import type {} from '../playback/frameScript';
import { useEffect, useState } from 'react';
import type { OverlayRect } from './overlayState';

const same = (a: OverlayRect | null, b: OverlayRect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

/** The element the locator matched in this frame, shared through the content scripts' isolated world. */
export const sharedTarget = (): Element | null =>
  globalThis.__sbWebTourFrame?.target?.el ?? null;

/** Follows the matched target's box every frame while `active`, scrolling it into view once per target. */
export function useTargetRect(active: boolean): OverlayRect | null {
  const [rect, setRect] = useState<OverlayRect | null>(null);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let scrolled: Element | null = null;
    let last: OverlayRect | null = null;
    const tick = () => {
      const el = sharedTarget();
      if (el && el !== scrolled) {
        scrolled = el;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      const r = el?.getBoundingClientRect();
      const next = r
        ? { x: r.x, y: r.y, width: r.width, height: r.height }
        : null;
      if (!same(next, last)) {
        last = next;
        setRect(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return active ? rect : null;
}
