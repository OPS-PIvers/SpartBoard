import { describe, expect, it } from 'vitest';
import {
  computeGuides,
  EMPTY_GUIDES,
  snapEdge,
  snapMove,
  type GuideRect,
} from './alignmentGuides';

const rect = (x: number, y: number, w = 100, h = 100): GuideRect => ({
  x,
  y,
  w,
  h,
});

describe('snapMove', () => {
  it('snaps a left edge onto a nearby left edge', () => {
    const others = [rect(200, 0)];
    expect(snapMove(rect(204, 400), others, 6)).toEqual({ x: 200, y: 400 });
  });

  it('snaps centres', () => {
    const others = [rect(0, 0, 200, 100)];
    // The 100-wide rect at 53 has its centre at 103; the target centre is 100.
    expect(snapMove(rect(53, 300), others, 6).x).toBe(50);
  });

  it('leaves the rect alone outside the threshold', () => {
    const others = [rect(200, 0)];
    expect(snapMove(rect(220, 400), others, 6)).toEqual({ x: 220, y: 400 });
  });

  it('keeps an exact alignment rather than jumping to a nearby equal gap', () => {
    // Left neighbour ends at 100, right starts at 404: an equal gap needs x = 202.
    const others = [rect(0, 0), rect(404, 0), rect(200, 500)];
    expect(snapMove(rect(200, 0), others, 6).x).toBe(200);
  });

  it('snaps to the midpoint between two neighbours in the same row', () => {
    const others = [rect(0, 0), rect(400, 0)];
    // Even spacing puts the 100-wide rect at x = 200 (gaps of 100).
    expect(snapMove(rect(197, 20), others, 6).x).toBe(200);
  });

  it('extends an existing gap in a row', () => {
    const others = [rect(0, 0), rect(150, 0)];
    // Gap between them is 50, so the next one sits at 300.
    expect(snapMove(rect(304, 10), others, 6).x).toBe(300);
  });

  it('does nothing with no other widgets', () => {
    expect(snapMove(rect(13, 17), [], 6)).toEqual({ x: 13, y: 17 });
  });
});

describe('snapEdge', () => {
  it('snaps a resizing edge to the nearest stop', () => {
    const others = [rect(0, 0, 300, 100)];
    expect(snapEdge(297, 'x', others, 6)).toBe(300);
    expect(snapEdge(153, 'x', others, 6)).toBe(150);
    expect(snapEdge(200, 'x', others, 6)).toBe(200);
  });
});

describe('computeGuides', () => {
  it('returns the shared empty value when nothing lines up', () => {
    expect(computeGuides(rect(37, 413), [rect(0, 0)])).toBe(EMPTY_GUIDES);
  });

  it('draws a vertical line spanning both widgets for a shared left edge', () => {
    const g = computeGuides(rect(200, 300), [rect(200, 0)]);
    expect(g.lines).toContainEqual({ axis: 'x', pos: 200, from: 0, to: 400 });
  });

  it('marks both gaps when a widget sits evenly between two others', () => {
    const g = computeGuides(rect(200, 0), [rect(0, 0), rect(400, 0)]);
    expect(g.spacing).toEqual([
      { axis: 'x', from: 100, to: 200, at: 50 },
      { axis: 'x', from: 300, to: 400, at: 50 },
    ]);
  });

  it('skips spacing when another widget overlaps the moving one', () => {
    const g = computeGuides(rect(200, 0), [
      rect(0, 0),
      rect(400, 0),
      rect(250, 50),
    ]);
    expect(g.spacing).toEqual([]);
  });

  it('ignores widgets in a different row for spacing', () => {
    const g = computeGuides(rect(200, 500), [rect(0, 0), rect(400, 0)]);
    expect(g.spacing).toEqual([]);
  });

  it('limits resize guides to the moving edge', () => {
    // Left edges already match; resizing the right edge onto 400 shows only that line.
    const others = [rect(0, 0, 400, 100)];
    const g = computeGuides(rect(0, 300, 400, 100), others, {
      x: 'end',
      y: null,
    });
    expect(g.lines).toEqual([{ axis: 'x', pos: 400, from: 0, to: 400 }]);
  });
});
