import type { TetherArrow } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SPARTY_SIZE = 64;
// His feet rest inside the tip's top padding, clear of the title, and he leans out past its edge.
export const SPARTY_RISE = SPARTY_SIZE - 8;
export const SPARTY_LEAN = 16;

export type Perch = 'left' | 'right' | 'inline';

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where he sits over the tip's top corners, in page px. */
const perchBox = (perch: 'left' | 'right', tip: Box, lean: number): Box => ({
  x:
    perch === 'left' ? tip.x - lean : tip.x + tip.w - SPARTY_SIZE + SPARTY_LEAN,
  y: tip.y - SPARTY_RISE,
  w: SPARTY_SIZE,
  h: SPARTY_RISE,
});

/** Top-left, else top-right, wherever he clears the target and the top of the screen; else beside the title. */
export const spartyPerch = (
  tip: { x: number; y: number | undefined; w: number },
  avoid: Box | null | undefined,
  tether: TetherArrow | null,
  lean = SPARTY_LEAN
): Perch => {
  // A tip pinned by its bottom sits above its target, so his corner is clear.
  if (tip.y === undefined) return 'left';
  if (tip.y < SPARTY_RISE) return 'inline';
  const box = { x: tip.x, y: tip.y, w: tip.w, h: 0 };
  const arrowAt = (perch: 'left' | 'right') =>
    tether?.edge === 'top' &&
    (perch === 'left'
      ? tether.offset < SPARTY_SIZE + lean
      : tether.offset > tip.w - SPARTY_SIZE - SPARTY_LEAN);
  const clear = (perch: 'left' | 'right') =>
    !arrowAt(perch) &&
    !(tether?.edge === 'left' && perch === 'left') &&
    !(tether?.edge === 'right' && perch === 'right') &&
    !(avoid && overlaps(perchBox(perch, box, lean), avoid));
  if (clear('left')) return 'left';
  if (clear('right')) return 'right';
  return 'inline';
};
