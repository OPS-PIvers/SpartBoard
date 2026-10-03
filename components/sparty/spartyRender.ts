import {
  SPARTY_POSES,
  SPARTY_POSE_IDS,
  type SpartyColor,
  type SpartyPose,
  type SpartyStep,
} from './spartyFrames';

/** One horizontal run of same-colored pixels; 'edge' is the light outline drawn on dark surfaces. */
export interface SpartyRun {
  x: number;
  y: number;
  width: number;
  color: SpartyColor | 'edge';
}

const toRuns = (
  rows: readonly string[],
  pick: (row: string, x: number, y: number) => SpartyRun['color'] | null
): SpartyRun[] => {
  const runs: SpartyRun[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = pick(row, x, y);
      if (!color) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < row.length && pick(row, end + 1, y) === color) end++;
      runs.push({ x, y, width: end - x + 1, color });
      x = end + 1;
    }
  });
  return runs;
};

export const gridToRuns = (grid: readonly string[]): SpartyRun[] =>
  toRuns(grid, (row, x) => (row[x] === '.' ? null : (row[x] as SpartyColor)));

// Transparent pixels that touch an opaque one on any side.
export const gridToEdgeRuns = (grid: readonly string[]): SpartyRun[] => {
  const solid = (x: number, y: number) =>
    y >= 0 &&
    y < grid.length &&
    x >= 0 &&
    x < grid[y].length &&
    grid[y][x] !== '.';
  return toRuns(grid, (row, x, y) =>
    row[x] === '.' &&
    (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))
      ? 'edge'
      : null
  );
};

export const SPARTY_RUNS: Record<SpartyPose, SpartyRun[][]> =
  Object.fromEntries(
    SPARTY_POSE_IDS.map((pose) => [
      pose,
      SPARTY_POSES[pose].frames.map(gridToRuns),
    ])
  ) as Record<SpartyPose, SpartyRun[][]>;

export const SPARTY_EDGE_RUNS: Record<SpartyPose, SpartyRun[][]> =
  Object.fromEntries(
    SPARTY_POSE_IDS.map((pose) => [
      pose,
      SPARTY_POSES[pose].frames.map(gridToEdgeRuns),
    ])
  ) as Record<SpartyPose, SpartyRun[][]>;

/** The frame shown before any animation runs and under reduced motion. */
export const firstFrame = (pose: SpartyPose): number => {
  const { gesture, loop } = SPARTY_POSES[pose];
  return (gesture[0] ?? loop[0])[0];
};

export const GESTURE_PLAYS = 2;

const pct = (n: number) => `${Number(n.toFixed(3))}%`;

const total = (steps: readonly SpartyStep[]) =>
  steps.reduce((sum, [, ms]) => sum + ms, 0);

// Visibility keyframes for one frame across a step sequence; the frame shows during each of its steps.
const frameKeyframes = (
  name: string,
  steps: readonly SpartyStep[],
  frame: number,
  endHidden: boolean
): string => {
  const length = total(steps);
  const stops: string[] = [];
  let start = 0;
  let shown = false;
  steps.forEach(([f, ms]) => {
    const on = f === frame;
    if (on !== shown || start === 0) {
      stops.push(
        `${pct((start / length) * 100)}{visibility:${on ? 'visible' : 'hidden'}}`
      );
      shown = on;
    }
    start += ms;
  });
  if (endHidden) stops.push('100%{visibility:hidden}');
  return `@keyframes ${name}{${stops.join('')}}`;
};

// Gesture frames play GESTURE_PLAYS times and end hidden; loop frames start once the gesture is done.
export const buildSpartyKeyframes = (): string =>
  SPARTY_POSE_IDS.map((pose) => {
    const { frames, gesture, loop } = SPARTY_POSES[pose];
    const gestureMs = total(gesture);
    const loopMs = total(loop);
    return frames
      .map((_, i) => {
        const css: string[] = [];
        const animations: string[] = [];
        if (gesture.some(([f]) => f === i)) {
          const name = `sparty-${pose}-g${i}`;
          css.push(frameKeyframes(name, gesture, i, true));
          animations.push(
            `${name} ${gestureMs}ms step-end ${GESTURE_PLAYS} forwards`
          );
        }
        if (loop.some(([f]) => f === i)) {
          const name = `sparty-${pose}-l${i}`;
          css.push(frameKeyframes(name, loop, i, false));
          animations.push(
            `${name} ${loopMs}ms step-end ${gestureMs * GESTURE_PLAYS}ms infinite`
          );
        }
        return `${css.join('')}.sparty-${pose} .sparty-f${i}{animation:${animations.join(',')}}`;
      })
      .join('');
  })
    .join('')
    .concat(
      '@media (prefers-reduced-motion: reduce){.sparty g{animation:none!important}}'
    );
