import { describe, expect, it } from 'vitest';
import {
  snapLineEnd,
  snapRotation,
  snapToGuides,
  squareCorner,
} from './shapeSnap';

describe('shape snapping', () => {
  it('squares a box toward the drag direction', () => {
    expect(squareCorner({ x: 10, y: 10 }, { x: 100, y: 40 })).toEqual({
      x: 100,
      y: 100,
    });
    expect(squareCorner({ x: 10, y: 10 }, { x: -20, y: 50 })).toEqual({
      x: -30,
      y: 50,
    });
  });

  it('snaps a line end to 15 degree steps and keeps its length', () => {
    const end = snapLineEnd({ x: 0, y: 0 }, { x: 100, y: 4 });
    expect(end).toEqual({ x: expect.closeTo(100.08, 1) as number, y: 0 });
    const diag = snapLineEnd({ x: 0, y: 0 }, { x: 50, y: 52 });
    expect(diag.x).toBeCloseTo(diag.y, 3);
  });

  it('rounds rotation to 15 degrees', () => {
    expect(snapRotation((22 * Math.PI) / 180)).toBeCloseTo((Math.PI / 12) * 1);
    expect(snapRotation((23 * Math.PI) / 180)).toBeCloseTo(Math.PI / 6);
  });

  it('snaps to another object edge and draws a guide across both', () => {
    const snap = snapToGuides(
      { x: 103, y: 300, w: 50, h: 20 },
      [{ x: 100, y: 10, w: 80, h: 40 }],
      { width: 1000, height: 1000 },
      6
    );
    expect(snap.dx).toBe(-3);
    expect(snap.dy).toBe(0);
    expect(snap.guides).toContainEqual({
      axis: 'x',
      at: 100,
      from: 10,
      to: 320,
    });
  });

  it('snaps to the page centre and ignores anything past the threshold', () => {
    const snap = snapToGuides(
      { x: 474, y: 700, w: 50, h: 20 },
      [{ x: 0, y: 0, w: 10, h: 10 }],
      { width: 1000, height: 900 },
      6
    );
    expect(snap.dx).toBe(1);
    expect(snap.dy).toBe(0);
    expect(snap.guides.map((g) => g.axis)).toEqual(['x']);
  });
});
