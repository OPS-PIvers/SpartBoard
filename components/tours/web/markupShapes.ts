import type { TourMarkupShape } from '@/types';

/** The number a new marker takes: one past the highest, which with renumbering is always the next free one. */
export const nextNumber = (shapes: readonly TourMarkupShape[]): number =>
  Math.max(0, ...shapes.map((s) => (s.kind === 'number' ? s.n : 0))) + 1;

/** The shapes without one; numbered markers close the gap, keeping their order, so the numbers stay 1, 2, 3. */
export function removeShape(
  shapes: readonly TourMarkupShape[],
  id: string
): TourMarkupShape[] {
  const left = shapes.filter((s) => s.id !== id);
  const order = left
    .filter((s) => s.kind === 'number')
    .sort((a, b) =>
      a.kind === 'number' && b.kind === 'number' ? a.n - b.n : 0
    )
    .map((s) => s.id);
  return left.map((s) =>
    s.kind === 'number' ? { ...s, n: order.indexOf(s.id) + 1 } : s
  );
}
