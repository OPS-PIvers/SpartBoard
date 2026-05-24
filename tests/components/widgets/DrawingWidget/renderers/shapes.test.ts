import { describe, it, expect, vi, Mock } from 'vitest';
import {
  renderArrow,
  renderEllipse,
  renderLine,
  renderRect,
} from '@/components/widgets/DrawingWidget/renderers/shapes';
import type {
  ArrowObject,
  EllipseObject,
  LineObject,
  RectObject,
} from '@/types';

interface MockCtx {
  save: Mock;
  restore: Mock;
  beginPath: Mock;
  moveTo: Mock;
  lineTo: Mock;
  closePath: Mock;
  stroke: Mock;
  fill: Mock;
  strokeRect: Mock;
  fillRect: Mock;
  ellipse: Mock;
  canvas: { width: number; height: number };
  lineCap: string;
  lineJoin: string;
  globalCompositeOperation: string;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
}

const makeMockCtx = (): MockCtx => ({
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  strokeRect: vi.fn(),
  fillRect: vi.fn(),
  ellipse: vi.fn(),
  canvas: { width: 800, height: 600 },
  lineCap: 'butt',
  lineJoin: 'miter',
  globalCompositeOperation: 'source-over',
  strokeStyle: '#000000',
  fillStyle: '#000000',
  lineWidth: 1,
});

const rectObj = (overrides: Partial<RectObject> = {}): RectObject => ({
  id: 'r1',
  kind: 'rect',
  z: 0,
  x: 10,
  y: 20,
  w: 100,
  h: 50,
  stroke: '#f00',
  strokeWidth: 4,
  ...overrides,
});

const ellipseObj = (overrides: Partial<EllipseObject> = {}): EllipseObject => ({
  id: 'e1',
  kind: 'ellipse',
  z: 0,
  x: 10,
  y: 20,
  w: 100,
  h: 50,
  stroke: '#0f0',
  strokeWidth: 3,
  ...overrides,
});

const lineObj = (overrides: Partial<LineObject> = {}): LineObject => ({
  id: 'l1',
  kind: 'line',
  z: 0,
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100,
  stroke: '#00f',
  strokeWidth: 2,
  ...overrides,
});

const arrowObj = (overrides: Partial<ArrowObject> = {}): ArrowObject => ({
  id: 'a1',
  kind: 'arrow',
  z: 0,
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 0,
  stroke: '#123',
  strokeWidth: 2,
  ...overrides,
});

describe('renderRect', () => {
  it('strokes a rect at the object geometry and brackets work in save/restore', () => {
    const ctx = makeMockCtx();
    renderRect(ctx as unknown as CanvasRenderingContext2D, rectObj());
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 100, 50);
    expect(ctx.strokeStyle).toBe('#f00');
    expect(ctx.lineWidth).toBe(4);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('fills the rect when obj.fill is set', () => {
    const ctx = makeMockCtx();
    renderRect(
      ctx as unknown as CanvasRenderingContext2D,
      rectObj({ fill: '#abc' })
    );
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 100, 50);
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 100, 50);
  });
});

describe('renderEllipse', () => {
  it('draws an ellipse centered in the bounding box', () => {
    const ctx = makeMockCtx();
    renderEllipse(ctx as unknown as CanvasRenderingContext2D, ellipseObj());
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    // center = (10 + 50, 20 + 25), radii = (50, 25)
    expect(ctx.ellipse).toHaveBeenCalledWith(60, 45, 50, 25, 0, 0, Math.PI * 2);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('fills the ellipse when obj.fill is set', () => {
    const ctx = makeMockCtx();
    renderEllipse(
      ctx as unknown as CanvasRenderingContext2D,
      ellipseObj({ fill: '#abc' })
    );
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});

describe('renderLine', () => {
  it('strokes from (x1,y1) to (x2,y2)', () => {
    const ctx = makeMockCtx();
    renderLine(ctx as unknown as CanvasRenderingContext2D, lineObj());
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});

describe('renderArrow', () => {
  it('strokes the shaft and fills a triangular head at (x2,y2)', () => {
    const ctx = makeMockCtx();
    renderArrow(ctx as unknown as CanvasRenderingContext2D, arrowObj());
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    // First subpath: shaft.
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 0, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 100, 0);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    // Second subpath: head triangle.
    expect(ctx.moveTo).toHaveBeenNthCalledWith(2, 100, 0);
    // Two lineTo calls form the head wings; one closePath + fill closes it.
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it('head length scales with strokeWidth (min 12, else 3x stroke)', () => {
    // With strokeWidth=2, headLen = max(12, 6) = 12.
    const ctx = makeMockCtx();
    renderArrow(
      ctx as unknown as CanvasRenderingContext2D,
      arrowObj({ x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth: 2 })
    );
    // Wing y-coords for horizontal arrow are ±headLen*sin(wingAngle)
    const headLen = 12;
    const wingAngle = Math.PI / 7;
    const wingY = headLen * Math.sin(wingAngle);
    const wingX = 100 - headLen * Math.cos(wingAngle);
    const left = ctx.lineTo.mock.calls[1];
    const right = ctx.lineTo.mock.calls[2];
    // For a horizontal arrow (angle=0): the "left" wing has y = +headLen*sin(wingAngle),
    // since leftY = y2 - headLen*sin(0 - wingAngle) = +headLen*sin(wingAngle).
    expect(left[0]).toBeCloseTo(wingX, 5);
    expect(left[1]).toBeCloseTo(wingY, 5);
    expect(right[0]).toBeCloseTo(wingX, 5);
    expect(right[1]).toBeCloseTo(-wingY, 5);
  });
});
