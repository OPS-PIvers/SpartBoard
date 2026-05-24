import { describe, it, expect } from 'vitest';
import {
  getBoundingBox,
  getHandlePositions,
  hitTestHandle,
  hitTestObject,
  hitTestObjects,
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
});
