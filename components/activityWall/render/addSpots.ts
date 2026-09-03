import type { ActivityWallSubmission } from '@/types';
import type { WallPlacement, WallRenderActions, WallRenderMode } from './types';

/** Hover-plus spots render only for posters: students and the teacher on the widget face. */
export const showsAddSpots = (
  mode: WallRenderMode,
  onAddAt: WallRenderActions['onAddAt']
): onAddAt is NonNullable<WallRenderActions['onAddAt']> =>
  Boolean(onAddAt) && (mode === 'student' || mode === 'widget');

const GAP_STEP = 1000;

const effectiveOrder = (submission: ActivityWallSubmission) =>
  typeof submission.order === 'number'
    ? submission.order
    : submission.submittedAt;

/** Timeline placement for the gap at `index` (0 = before the first card, n = after the last). */
export const gapPlacement = (
  items: ActivityWallSubmission[],
  index: number
): WallPlacement => {
  if (items.length === 0) return { order: Date.now() };
  const prev = index > 0 ? effectiveOrder(items[index - 1]) : null;
  const next = index < items.length ? effectiveOrder(items[index]) : null;
  if (prev === null) return { order: (next as number) - GAP_STEP };
  if (next === null) return { order: prev + GAP_STEP };
  return { order: (prev + next) / 2 };
};
