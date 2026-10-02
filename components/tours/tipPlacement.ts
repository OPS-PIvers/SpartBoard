import {
  rectOverlapArea,
  type Size,
} from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import type { PxRect } from '@/components/widgets/GuidedLearning/types/stage';

/** A centred tip, moved below or above any obstacle (the top bar) it would cover. */
export function centreTip(
  box: Size,
  view: Size,
  obstacles: readonly PxRect[],
  gutter: number
): { left: number; top: number } {
  const left = Math.max(gutter, (view.w - box.w) / 2);
  const centred = Math.max(gutter, (view.h - box.h) / 2);
  const at = (top: number): PxRect => ({ x: left, y: top, w: box.w, h: box.h });
  const hits = obstacles.filter((o) => rectOverlapArea(at(centred), o) > 0);
  if (hits.length === 0) return { left, top: centred };
  const below = Math.max(...hits.map((o) => o.y + o.h)) + gutter;
  if (below + box.h <= view.h - gutter) return { left, top: below };
  const above = Math.min(...hits.map((o) => o.y)) - gutter - box.h;
  return { left, top: Math.max(gutter, above) };
}
