export interface Tap {
  x: number;
  y: number;
  at: number;
}

export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_PX = 24;

/** Two taps close together in time and place. */
export const isDoubleTap = (prev: Tap | null, next: Tap): boolean =>
  !!prev &&
  next.at - prev.at >= 0 &&
  next.at - prev.at <= DOUBLE_TAP_MS &&
  Math.hypot(prev.x - next.x, prev.y - next.y) <= DOUBLE_TAP_PX;
