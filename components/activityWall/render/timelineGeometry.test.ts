import { describe, expect, it } from 'vitest';
import {
  breakLabel,
  fitZoomLevel,
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
    const geometry = layoutTimeline({ ...base, items, pxPerYear: 5 });
    const xs = geometry.placements.map((p) => p.dotX);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(geometry.placements.map((p) => p.side)).toEqual([
      'above',
      'below',
      'above',
    ]);
    expect(xs[1] - xs[0]).toBeCloseTo(500);
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

  it('shrinks long empty gaps into a marked break and keeps true scale elsewhere', () => {
    const items: TimelineInput[] = [
      { id: 'a', key: 1440 },
      { id: 'b', key: 1944 },
      { id: 'c', key: 1956 },
    ];
    const geometry = layoutTimeline({ ...base, items, pxPerYear: 10 });
    expect(geometry.breaks).toHaveLength(1);
    expect(geometry.breaks[0].years).toBe(504);
    expect(breakLabel(geometry.breaks[0].years)).toBe('504 years');
    const [, b, c] = geometry.placements;
    expect(c.dotX - b.dotX).toBeCloseTo(120);
  });

  it('fit level keeps the layout in the viewport when it can', () => {
    const items: TimelineInput[] = [
      { id: 'a', key: 1440 },
      { id: 'b', key: 1944 },
      { id: 'c', key: 1956 },
    ];
    const level = fitZoomLevel({ ...base, items }, 1000, 1, -8, 12);
    expect(
      layoutTimeline({ ...base, items, pxPerYear: 2 ** level }).width
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
    const ticks = timelineTicks(geometry, 1, 60, base.cardWidth);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks.some((t) => t.label === '0')).toBe(false);
    expect(ticks.some((t) => t.label.endsWith('BCE'))).toBe(true);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i].x - ticks[i - 1].x).toBeGreaterThanOrEqual(60);
    }
  });

  it('holds up across thousands of random timelines', () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 2000; run += 1) {
      const count = Math.floor(rand() * 40);
      const span = 10 ** Math.floor(rand() * 5);
      const items: TimelineInput[] = Array.from({ length: count }, (_, i) => ({
        id: String(i),
        key: rand() < 0.1 ? null : Math.round((rand() - 0.3) * span * 12) / 12,
      })).sort((a, b) => (a.key ?? Infinity) - (b.key ?? Infinity));
      const input = {
        ...base,
        items,
        lanesPerSide: 1 + Math.floor(rand() * 3),
      };
      const viewport = 300 + rand() * 1500;
      const baseScale = 1 / span;
      const level = fitZoomLevel(input, viewport, baseScale, -8, 12);
      const scale = baseScale * 2 ** level;
      const geometry = layoutTimeline({ ...input, pxPerYear: scale });
      // Honest scale: consecutive markers are either true-scale apart or separated by a break.
      const knots = geometry.knots;
      for (let i = 1; i < knots.length; i += 1) {
        const trueGap = (knots[i].key - knots[i - 1].key) * scale;
        const drawn = knots[i].x - knots[i - 1].x;
        const broken = geometry.breaks.some(
          (b) => b.fromX >= knots[i - 1].x && b.toX <= knots[i].x
        );
        if (!broken) expect(Math.abs(drawn - trueGap)).toBeLessThan(1);
      }
      expect(overlaps(geometry, base.cardWidth)).toBe(false);
      expect(Number.isFinite(geometry.width)).toBe(true);
      const dated = geometry.placements.filter((p) => p.dated);
      for (let i = 1; i < dated.length; i += 1) {
        expect(dated[i].dotX).toBeGreaterThanOrEqual(dated[i - 1].dotX);
      }
      const ticks = timelineTicks(geometry, scale, 60, base.cardWidth);
      for (let i = 1; i < ticks.length; i += 1) {
        expect(ticks[i].x - ticks[i - 1].x).toBeGreaterThanOrEqual(60);
      }
      expect(ticks.some((t) => /^0\b|\b0$/.test(t.label))).toBe(false);
    }
  });
});
