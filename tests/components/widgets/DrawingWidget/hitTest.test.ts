import { describe, it, expect } from 'vitest';
import {
  getBoundingBox,
  getHandlePositions,
  getStrokedBoundingBox,
  hitTestHandle,
  hitTestObject,
  hitTestObjects,
  reverseRotatePoint,
  rotatePoint,
} from '@/components/widgets/DrawingWidget/hitTest';
import type {
  ArrowObject,
  DrawableObject,
  EllipseObject,
  ImageObject,
  LineObject,
  PathObject,
  RectObject,
  TextObject,
} from '@/types';

const rect = (overrides: Partial<RectObject> = {}): RectObject => ({
  id: 'r',
  kind: 'rect',
  z: 0,
  x: 10,
  y: 20,
  w: 100,
  h: 50,
  stroke: '#000',
  strokeWidth: 2,
  ...overrides,
});

const ellipse = (overrides: Partial<EllipseObject> = {}): EllipseObject => ({
  id: 'e',
  kind: 'ellipse',
  z: 0,
  x: 0,
  y: 0,
  w: 100,
  h: 50,
  stroke: '#000',
  strokeWidth: 2,
  ...overrides,
});

const line = (overrides: Partial<LineObject> = {}): LineObject => ({
  id: 'l',
  kind: 'line',
  z: 0,
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100,
  stroke: '#000',
  strokeWidth: 4,
  ...overrides,
});

const arrow = (overrides: Partial<ArrowObject> = {}): ArrowObject => ({
  id: 'a',
  kind: 'arrow',
  z: 0,
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100,
  stroke: '#000',
  strokeWidth: 4,
  ...overrides,
});

const path = (overrides: Partial<PathObject> = {}): PathObject => ({
  id: 'p',
  kind: 'path',
  z: 0,
  points: [
    { x: 0, y: 0 },
    { x: 50, y: 50 },
    { x: 100, y: 100 },
  ],
  color: '#000',
  width: 4,
  ...overrides,
});

const text = (overrides: Partial<TextObject> = {}): TextObject => ({
  id: 't',
  kind: 'text',
  z: 0,
  x: 5,
  y: 5,
  w: 80,
  h: 20,
  content: 'hi',
  fontFamily: 'sans-serif',
  fontSize: 16,
  color: '#000',
  ...overrides,
});

const image = (overrides: Partial<ImageObject> = {}): ImageObject => ({
  id: 'i',
  kind: 'image',
  z: 0,
  x: 200,
  y: 200,
  w: 100,
  h: 80,
  src: 'about:blank',
  ...overrides,
});

describe('getBoundingBox', () => {
  it('returns the rect bbox directly', () => {
    expect(getBoundingBox(rect())).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it('normalizes line endpoints into a positive-area bbox', () => {
    const out = getBoundingBox(line({ x1: 100, y1: 100, x2: 20, y2: 30 }));
    expect(out).toEqual({ x: 20, y: 30, w: 80, h: 70 });
  });

  it('derives a path bbox from its points', () => {
    const out = getBoundingBox(
      path({
        points: [
          { x: 5, y: 5 },
          { x: 50, y: -10 },
          { x: 25, y: 80 },
        ],
      })
    );
    expect(out).toEqual({ x: 5, y: -10, w: 45, h: 90 });
  });
});

describe('hitTestObject', () => {
  it('rect: hits inside, misses outside', () => {
    expect(hitTestObject(rect(), { x: 30, y: 30 })).toBe(true);
    expect(hitTestObject(rect(), { x: 200, y: 200 })).toBe(false);
  });

  it('ellipse: hits center, misses corner of bbox', () => {
    const e = ellipse({ x: 0, y: 0, w: 100, h: 50 });
    expect(hitTestObject(e, { x: 50, y: 25 })).toBe(true); // center
    // bbox corner is OUTSIDE the inscribed ellipse — refinement check
    expect(hitTestObject(e, { x: 1, y: 1 })).toBe(false);
  });

  it('line: hits within stroke tolerance, misses outside', () => {
    const l = line({ x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth: 4 });
    expect(hitTestObject(l, { x: 50, y: 1 })).toBe(true);
    // 4 / 2 + 4 padding = 6px tolerance — y=10 must miss.
    expect(hitTestObject(l, { x: 50, y: 10 })).toBe(false);
  });

  it('arrow: same stroke proximity as line', () => {
    const a = arrow({ x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth: 4 });
    expect(hitTestObject(a, { x: 50, y: 2 })).toBe(true);
    expect(hitTestObject(a, { x: 50, y: 50 })).toBe(false);
  });

  it('path: hits along the stroke, misses far from segments', () => {
    const p = path();
    expect(hitTestObject(p, { x: 25, y: 25 })).toBe(true);
    expect(hitTestObject(p, { x: 500, y: 500 })).toBe(false);
  });

  it('text and image use bbox containment', () => {
    expect(hitTestObject(text(), { x: 10, y: 10 })).toBe(true);
    expect(hitTestObject(text(), { x: 200, y: 200 })).toBe(false);
    expect(hitTestObject(image(), { x: 220, y: 220 })).toBe(true);
    expect(hitTestObject(image(), { x: 10, y: 10 })).toBe(false);
  });
});

describe('hitTestObjects', () => {
  it('returns the top-most object when multiple are hit', () => {
    const lower = rect({ id: 'lower', z: 0 });
    const higher = rect({ id: 'higher', z: 5 });
    const objects: DrawableObject[] = [lower, higher];
    const hit = hitTestObjects(objects, { x: 30, y: 30 });
    expect(hit?.id).toBe('higher');
  });

  it('returns null when no object is hit', () => {
    const hit = hitTestObjects([rect()], { x: 500, y: 500 });
    expect(hit).toBeNull();
  });
});

describe('getHandlePositions', () => {
  it('places handles at the bbox corners and midpoints with rotation above', () => {
    const positions = getHandlePositions({ x: 0, y: 0, w: 100, h: 50 });
    expect(positions.nw).toEqual({ x: 0, y: 0 });
    expect(positions.ne).toEqual({ x: 100, y: 0 });
    expect(positions.se).toEqual({ x: 100, y: 50 });
    expect(positions.sw).toEqual({ x: 0, y: 50 });
    expect(positions.n).toEqual({ x: 50, y: 0 });
    expect(positions.s).toEqual({ x: 50, y: 50 });
    expect(positions.e).toEqual({ x: 100, y: 25 });
    expect(positions.w).toEqual({ x: 0, y: 25 });
    expect(positions.rotate.x).toBe(50);
    expect(positions.rotate.y).toBeLessThan(0);
  });
});

describe('hitTestHandle', () => {
  it('returns the corner handle when the pointer is over it', () => {
    const r = rect({ x: 0, y: 0, w: 100, h: 50 });
    // At scale=1, half-side ~7.5px around each handle center.
    expect(hitTestHandle(r, { x: 0, y: 0 }, 1)).toBe('nw');
    expect(hitTestHandle(r, { x: 100, y: 50 }, 1)).toBe('se');
  });

  it('returns null when the pointer is far from every handle', () => {
    const r = rect({ x: 0, y: 0, w: 100, h: 50 });
    expect(hitTestHandle(r, { x: 50, y: 25 }, 1)).toBeNull();
  });

  it('returns the rotation handle when the pointer is above the bbox top', () => {
    const r = rect({ x: 0, y: 0, w: 100, h: 50 });
    const handle = hitTestHandle(r, { x: 50, y: -24 }, 1);
    expect(handle).toBe('rotate');
  });

  it('hit-region scales with the canvas-to-CSS ratio (smaller scale = larger region)', () => {
    // At scale=0.5 (canvas is rendered at twice its internal size on screen),
    // the half-side grows from ~7.5 to ~15. A pointer 12px off the NW corner
    // is OUT of range at scale=1 but IN range at scale=0.5.
    const r = rect({ x: 0, y: 0, w: 100, h: 50 });
    expect(hitTestHandle(r, { x: 12, y: 12 }, 1)).toBeNull();
    expect(hitTestHandle(r, { x: 12, y: 12 }, 0.5)).toBe('nw');
  });
});

describe('rotation helpers', () => {
  it('rotatePoint of identity (angle=0) returns the input point unchanged', () => {
    expect(rotatePoint({ x: 7, y: 3 }, { x: 0, y: 0 }, 0)).toEqual({
      x: 7,
      y: 3,
    });
  });

  it('rotatePoint of a non-finite angle is a no-op', () => {
    expect(rotatePoint({ x: 7, y: 3 }, { x: 0, y: 0 }, NaN)).toEqual({
      x: 7,
      y: 3,
    });
  });

  it('rotatePoint by 90° CW (PI/2 radians) maps (1,0) → (0,1) around the origin', () => {
    const out = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(1, 5);
  });

  it('reverseRotatePoint is the inverse of rotatePoint', () => {
    const center = { x: 50, y: 25 };
    const original = { x: 80, y: 10 };
    const rotated = rotatePoint(original, center, 0.7);
    const back = reverseRotatePoint(rotated, center, 0.7);
    expect(back.x).toBeCloseTo(original.x, 5);
    expect(back.y).toBeCloseTo(original.y, 5);
  });
});

describe('hitTestObject with rotation', () => {
  it('rotated rect: a point inside the visual rotated shape hits even when outside the unrotated AABB', () => {
    // Rotate a 100×50 rect at (0,0) by 90° around its center (50, 25). After
    // rotation, the rect's footprint is roughly the region around the same
    // center but with width and height swapped. A point at (25, -10) is
    // OUTSIDE the unrotated bbox (y<0) but INSIDE the rotated shape.
    const r = rect({
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      rotation: Math.PI / 2,
    });
    expect(hitTestObject(r, { x: 25, y: -10 })).toBe(true);
    // A point far outside both the unrotated AND the rotated bbox misses.
    expect(hitTestObject(r, { x: 200, y: 200 })).toBe(false);
  });

  it('rotated rect: a point inside the unrotated AABB but outside the rotated shape MISSES', () => {
    // Rect rotated by 45° around its center. A corner of the unrotated bbox
    // (e.g. (0,0) on a centered 100×100 rect at (-50,-50)) is OUTSIDE the
    // rotated diamond shape's footprint at that exact point.
    const r = rect({
      x: -50,
      y: -50,
      w: 100,
      h: 100,
      rotation: Math.PI / 4,
    });
    // Pick a point that's inside the unrotated AABB corner but outside the
    // 45°-rotated diamond's footprint.
    expect(hitTestObject(r, { x: -49, y: -49 })).toBe(false);
    // And a point near the rotated tip IS inside.
    expect(hitTestObject(r, { x: 0, y: -70 })).toBe(true);
  });

  it('rotated text: bbox hit-test runs in the local frame', () => {
    const t = text({
      x: 0,
      y: 0,
      w: 80,
      h: 20,
      rotation: Math.PI / 2, // 90° rotation around center (40, 10)
    });
    // Center of bbox always hits regardless of rotation.
    expect(hitTestObject(t, { x: 40, y: 10 })).toBe(true);
    // A point at (45, 50) is outside the unrotated 20-tall bbox but lands
    // inside the rotated text's footprint.
    expect(hitTestObject(t, { x: 45, y: 35 })).toBe(true);
  });

  it('rotated ellipse: implicit-equation test runs in the local frame', () => {
    const e = ellipse({
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      rotation: Math.PI / 2,
    });
    // Center always hits.
    expect(hitTestObject(e, { x: 50, y: 25 })).toBe(true);
    // After 90° rotation the long axis is vertical — a point along that
    // local y-axis lands inside.
    expect(hitTestObject(e, { x: 50, y: -20 })).toBe(true);
  });

  it('lines and arrows ignore obj.rotation (their geometry is endpoint-defined)', () => {
    const l = line({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      strokeWidth: 4,
      rotation: Math.PI / 2,
    });
    // Hit-test must use endpoints directly. (50,1) on the unrotated segment
    // is inside the stroke tolerance.
    expect(hitTestObject(l, { x: 50, y: 1 })).toBe(true);
    // If rotation were applied, this point would be the rotated equivalent.
    // It's NOT — so a point far from the original segment misses.
    expect(hitTestObject(l, { x: 50, y: 60 })).toBe(false);
  });
});

describe('getHandlePositions with rotation', () => {
  it('rotates each handle around the bbox center when rotation is non-zero', () => {
    const positions = getHandlePositions(
      { x: 0, y: 0, w: 100, h: 50 },
      Math.PI / 2
    );
    // 90° CW rotation around center (50, 25) maps:
    //   NW (0, 0) → (75, -25)
    //   NE (100, 0) → (75, 75)
    expect(positions.nw.x).toBeCloseTo(75, 5);
    expect(positions.nw.y).toBeCloseTo(-25, 5);
    expect(positions.ne.x).toBeCloseTo(75, 5);
    expect(positions.ne.y).toBeCloseTo(75, 5);
  });

  it('returns the same positions as the unrotated call when rotation is zero', () => {
    const bbox = { x: 10, y: 20, w: 100, h: 50 };
    const a = getHandlePositions(bbox);
    const b = getHandlePositions(bbox, 0);
    expect(a).toEqual(b);
  });
});

describe('getStrokedBoundingBox', () => {
  it('widens a rect bbox by half the stroke width on each side', () => {
    const out = getStrokedBoundingBox(
      rect({ x: 10, y: 20, w: 100, h: 50, strokeWidth: 20 })
    );
    // strokeWidth=20 → pad=10 on each side
    expect(out).toEqual({ x: 0, y: 10, w: 120, h: 70 });
  });

  it('widens an arrow bbox by the arrow head length (max of 12 or 3*strokeWidth)', () => {
    const out = getStrokedBoundingBox(
      arrow({ x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth: 4 })
    );
    // headLen = max(12, 12) = 12
    expect(out?.x).toBe(-12);
    expect(out?.y).toBe(-12);
    expect(out?.w).toBe(124);
    expect(out?.h).toBe(24);
  });

  it('returns null for an empty path', () => {
    const out = getStrokedBoundingBox(path({ points: [] }));
    expect(out).toBeNull();
  });

  it('expands rotated-bbox AABB so the dirty region covers the on-screen footprint', () => {
    // A 100×50 rect rotated 90° around its center has a rotated footprint
    // wider on Y and narrower on X relative to the unrotated bbox.
    const out = getStrokedBoundingBox(
      rect({
        x: 0,
        y: 0,
        w: 100,
        h: 50,
        strokeWidth: 0,
        rotation: Math.PI / 2,
      })
    );
    // After rotation around center (50, 25), corners land at
    //   (75, -25), (75, 75), (25, 75), (25, -25). AABB → x:25, y:-25, w:50, h:100.
    expect(out?.x).toBeCloseTo(25, 5);
    expect(out?.y).toBeCloseTo(-25, 5);
    expect(out?.w).toBeCloseTo(50, 5);
    expect(out?.h).toBeCloseTo(100, 5);
  });
});
