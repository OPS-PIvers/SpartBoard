import { describe, expect, it } from 'vitest';
import {
  fitTimelineScale,
  layoutTimeline,
  timelineTicks,
  type TimelineInput,
} from './timelineGeometry';

const base = { cardWidth: 200, gap: 10, pad: 10, lanesPerSide: 1 };

const overlaps = (
  geometry: ReturnType<typeof layoutTimeline>,
  cardWidth: number
) =>
  geometry.placements.some((a, i) =>
    geometry.placements.some(
      (b, j) =>
        i < j &&
        a.side === b.side &&
        a.lane === b.lane &&
        a.cardX < b.cardX + cardWidth &&
        b.cardX < a.cardX + cardWidth
    )
  );

describe('timeline geometry', () => {
  it('puts markers in date order and alternates sides', () => {
    const items: TimelineInput[] = [
      { id: 'a', key: 1800 },
      { id: 'b', key: 1900 },
      { id: 'c', key: 2000 },
    ];
    const geometry = layoutTimeline({ ...base, items, pxPerYear: 10 });
    const xs = geometry.placements.map((p) => p.dotX);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(geometry.placements.map((p) => p.side)).toEqual([
      'above',
      'below',
      'above',
    ]);
    expect(xs[1] - xs[0]).toBeCloseTo(1000);
  });

  it('never overlaps cards, even for crowded or equal dates', () => {
    const items: TimelineInput[] = [1940, 1941, 1941, 1941, 1942, 1943].map(
      (key, i) => ({ id: String(i), key })
    );
    const geometry = layoutTimeline({ ...base, items, pxPerYear: 1 });
    expect(overlaps(geometry, base.cardWidth)).toBe(false);
  });

  it('puts undated posts after the dated axis', () => {
    const geometry = layoutTimeline({
      ...base,
      items: [
        { id: 'a', key: 1900 },
        { id: 'u', key: null },
      ],
      pxPerYear: 1,
    });
    const undated = geometry.placements.find((p) => p.id === 'u');
    expect(undated?.dated).toBe(false);
    expect(geometry.undatedStart).not.toBeNull();
    expect(undated?.cardX).toBeGreaterThanOrEqual(
      geometry.undatedStart as number
    );
  });

  it('fit scale keeps everything in the viewport when it can', () => {
    const items: TimelineInput[] = [
      { id: 'a', key: 1440 },
      { id: 'b', key: 1944 },
      { id: 'c', key: 1956 },
    ];
    const scale = fitTimelineScale({ ...base, items }, 1000);
    expect(
      layoutTimeline({ ...base, items, pxPerYear: scale }).width
    ).toBeLessThanOrEqual(1000);
  });

  it('labels ticks in order, skips year zero, and keeps them apart', () => {
    const geometry = layoutTimeline({
      ...base,
      items: [
        { id: 'a', key: -500 },
        { id: 'b', key: 500 },
      ],
      pxPerYear: 1,
    });
    const ticks = timelineTicks(geometry, 60, base.cardWidth);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks.some((t) => t.label === '0')).toBe(false);
    expect(ticks.some((t) => t.label.endsWith('BCE'))).toBe(true);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i].x - ticks[i - 1].x).toBeGreaterThanOrEqual(60);
    }
  });
});
