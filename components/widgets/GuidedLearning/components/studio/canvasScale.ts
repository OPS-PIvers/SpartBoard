import type { StageGeometry } from '../../types/stage';

export interface CanvasScale {
  /** Screen px per image-%, per axis. */
  pxPerPct: { x: number; y: number };
  /** Screen px per stage container px (device frame scale × canvas zoom). */
  screenPerPx: number;
}

/** Screen-space scale of the stage from the frame scale and canvas zoom; pan-zoom is already in the geometry. */
export function screenScale(
  g: StageGeometry,
  screenPerPx: number
): CanvasScale {
  const o = g.imagePctToContainerPx({ xPct: 0, yPct: 0 });
  const e = g.imagePctToContainerPx({ xPct: 100, yPct: 100 });
  return {
    pxPerPct: {
      x: Math.max(((e.x - o.x) / 100) * screenPerPx, 1e-6),
      y: Math.max(((e.y - o.y) / 100) * screenPerPx, 1e-6),
    },
    screenPerPx,
  };
}

/** The rendered callout box of a step inside `root`. */
export function findCallout(
  root: Element | null | undefined,
  stepId: string
): Element | null {
  if (!root) return null;
  for (const el of root.querySelectorAll('[data-gl-callout]')) {
    if (el.getAttribute('data-gl-callout') === stepId) return el;
  }
  return null;
}
