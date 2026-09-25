import type { GuidedLearningStep } from '@/types';
import type { PctBox } from './regionEdits';
import { stepBox } from './regionEdits';

/** Snap distance in screen px. */
export const SNAP_PX = 6;

export interface SnapTargets {
  xs: number[];
  ys: number[];
}

export interface SnapGuides {
  x: number | null;
  y: number | null;
}

/** Edges and centres of the other regions on the slide, plus the image centre lines. */
export function snapTargets(
  steps: GuidedLearningStep[],
  excludeId: string | null
): SnapTargets {
  const xs = [50];
  const ys = [50];
  for (const s of steps) {
    if (s.id === excludeId) continue;
    if (!s.region) {
      xs.push(s.xPct);
      ys.push(s.yPct);
      continue;
    }
    const b = stepBox(s);
    xs.push(b.l, s.xPct, b.r);
    ys.push(b.t, s.yPct, b.b);
  }
  return { xs, ys };
}

/** Smallest correction that brings one of `values` onto a target within `limit`. */
function nearest(
  values: number[],
  targets: number[],
  limit: number
): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const delta = t - v;
      if (
        Math.abs(delta) <= limit &&
        (!best || Math.abs(delta) < Math.abs(best.delta))
      ) {
        best = { delta, at: t };
      }
    }
  }
  return best;
}

/** Snaps a moving box's edges and centre; returns the shift to apply and the guides to draw. */
export function snapMove(
  box: PctBox,
  targets: SnapTargets,
  limitPct: { x: number; y: number }
): { dx: number; dy: number; guides: SnapGuides } {
  const x = nearest(
    [box.l, (box.l + box.r) / 2, box.r],
    targets.xs,
    limitPct.x
  );
  const y = nearest(
    [box.t, (box.t + box.b) / 2, box.b],
    targets.ys,
    limitPct.y
  );
  return {
    dx: x?.delta ?? 0,
    dy: y?.delta ?? 0,
    guides: { x: x?.at ?? null, y: y?.at ?? null },
  };
}

/** Snaps a single dragged point (a resize edge, vertex or draw corner). */
export function snapPoint(
  p: { xPct: number; yPct: number },
  targets: SnapTargets,
  limitPct: { x: number; y: number },
  axes: { x: boolean; y: boolean } = { x: true, y: true }
): { xPct: number; yPct: number; guides: SnapGuides } {
  const x = axes.x ? nearest([p.xPct], targets.xs, limitPct.x) : null;
  const y = axes.y ? nearest([p.yPct], targets.ys, limitPct.y) : null;
  return {
    xPct: p.xPct + (x?.delta ?? 0),
    yPct: p.yPct + (y?.delta ?? 0),
    guides: { x: x?.at ?? null, y: y?.at ?? null },
  };
}

/** Callout box targets: image edges and centre lines, every hotspot (its own too) and the other boxes. */
export function calloutSnapTargets(
  steps: GuidedLearningStep[],
  stepId: string
): SnapTargets {
  const { xs, ys } = snapTargets(steps, null);
  xs.push(0, 100);
  ys.push(0, 100);
  for (const s of steps) {
    const b = s.calloutBox;
    if (s.id === stepId || !b) continue;
    xs.push(b.xPct, b.xPct + b.wPct);
    ys.push(b.yPct, b.yPct + b.hPct);
  }
  return { xs, ys };
}
