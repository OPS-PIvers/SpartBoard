import {
  SPARTY_POSES,
  SPARTY_POSE_IDS,
  type SpartyColor,
  type SpartyPose,
} from './spartyFrames';

/** One horizontal run of same-colored pixels. */
export interface SpartyRun {
  x: number;
  y: number;
  width: number;
  color: SpartyColor;
}

export const gridToRuns = (grid: readonly string[]): SpartyRun[] => {
  const runs: SpartyRun[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row[x];
      if (char === '.') {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < row.length && row[end + 1] === char) end++;
      runs.push({ x, y, width: end - x + 1, color: char as SpartyColor });
      x = end + 1;
    }
  });
  return runs;
};

export const SPARTY_RUNS: Record<SpartyPose, SpartyRun[][]> =
  Object.fromEntries(
    SPARTY_POSE_IDS.map((pose) => [
      pose,
      SPARTY_POSES[pose].frames.map(gridToRuns),
    ])
  ) as Record<SpartyPose, SpartyRun[][]>;

const pct = (n: number) => `${Number(n.toFixed(3))}%`;

// Each frame toggles visibility over its slice of the pose's loop; step-end keeps the switch instant.
export const buildSpartyKeyframes = (): string =>
  SPARTY_POSE_IDS.map((pose) => {
    const { durations } = SPARTY_POSES[pose];
    const total = durations.reduce((sum, d) => sum + d, 0);
    let start = 0;
    return durations
      .map((d, i) => {
        const from = (start / total) * 100;
        const to = ((start + d) / total) * 100;
        start += d;
        const name = `sparty-${pose}-${i}`;
        const steps = [
          `0%{visibility:${from === 0 ? 'visible' : 'hidden'}}`,
          from > 0 ? `${pct(from)}{visibility:visible}` : '',
          to < 100 ? `${pct(to)}{visibility:hidden}` : '',
        ].join('');
        return `@keyframes ${name}{${steps}}.sparty-${pose} .sparty-f${i}{animation:${name} ${total}ms step-end infinite}`;
      })
      .join('');
  })
    .join('')
    .concat(
      '@media (prefers-reduced-motion: reduce){.sparty g{animation:none!important}}'
    );
