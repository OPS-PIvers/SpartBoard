import { describe, it, expect, vi, Mock } from 'vitest';
import {
  renderObject,
  renderPathPoints,
} from '@/components/widgets/DrawingWidget/renderers/dispatcher';
import { _clearImageCacheForTesting } from '@/components/widgets/DrawingWidget/renderers/image';
import type {
  ArrowObject,
  EllipseObject,
  ImageObject,
  LineObject,
  PathObject,
  RectObject,
  TextObject,
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
  fillText: Mock;
  drawImage: Mock;
  translate: Mock;
  rotate: Mock;
  canvas: { width: number; height: number };
  lineCap: string;
  lineJoin: string;
  globalCompositeOperation: string;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  font: string;
  textBaseline: string;
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
  fillText: vi.fn(),
  drawImage: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  canvas: { width: 800, height: 600 },
  lineCap: 'round',
  lineJoin: 'round',
  globalCompositeOperation: 'source-over',
  strokeStyle: '#000',
  fillStyle: '#000',
  lineWidth: 1,
  font: '10px sans-serif',
  textBaseline: 'alphabetic',
});

describe('renderObject dispatcher', () => {
  it('routes path objects to the path renderer (which strokes between points)', () => {
    const ctx = makeMockCtx();
    const p: PathObject = {
      id: 'p',
      kind: 'path',
      z: 0,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      color: '#000',
      width: 4,
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, p);
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 2);
    expect(ctx.lineTo).toHaveBeenCalledWith(3, 4);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('routes rect objects to renderRect (strokeRect at object geometry)', () => {
    const ctx = makeMockCtx();
    const r: RectObject = {
      id: 'r',
      kind: 'rect',
      z: 0,
      x: 5,
      y: 6,
      w: 50,
      h: 40,
      stroke: '#000',
      strokeWidth: 2,
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, r);
    expect(ctx.strokeRect).toHaveBeenCalledWith(5, 6, 50, 40);
  });

  it('routes ellipse objects to renderEllipse', () => {
    const ctx = makeMockCtx();
    const e: EllipseObject = {
      id: 'e',
      kind: 'ellipse',
      z: 0,
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      stroke: '#000',
      strokeWidth: 2,
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, e);
    expect(ctx.ellipse).toHaveBeenCalledWith(50, 25, 50, 25, 0, 0, Math.PI * 2);
  });

  it('routes line objects to renderLine', () => {
    const ctx = makeMockCtx();
    const l: LineObject = {
      id: 'l',
      kind: 'line',
      z: 0,
      x1: 1,
      y1: 2,
      x2: 100,
      y2: 200,
      stroke: '#000',
      strokeWidth: 2,
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, l);
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 2);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 200);
  });

  it('routes arrow objects to renderArrow (shaft + head triangle)', () => {
    const ctx = makeMockCtx();
    const a: ArrowObject = {
      id: 'a',
      kind: 'arrow',
      z: 0,
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      stroke: '#000',
      strokeWidth: 2,
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, a);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.closePath).toHaveBeenCalled();
  });

  it('routes text objects to renderText (fillText)', () => {
    const ctx = makeMockCtx();
    const t: TextObject = {
      id: 't',
      kind: 'text',
      z: 0,
      x: 10,
      y: 20,
      w: 80,
      h: 30,
      content: 'hi',
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, t);
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('skips empty-content text objects (in-edit sentinel)', () => {
    const ctx = makeMockCtx();
    const t: TextObject = {
      id: 't',
      kind: 'text',
      z: 0,
      x: 0,
      y: 0,
      w: 80,
      h: 30,
      content: '',
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#000',
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, t);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('routes image objects to renderImage (no draw until load)', () => {
    _clearImageCacheForTesting();
    const ctx = makeMockCtx();
    const img: ImageObject = {
      id: 'i',
      kind: 'image',
      z: 0,
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      src: 'about:blank',
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, img);
    // First call allocates the Image but doesn't draw yet.
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('renderPathPoints emits begin/move/line/stroke and resets composite op', () => {
    const ctx = makeMockCtx();
    renderPathPoints(
      ctx as unknown as CanvasRenderingContext2D,
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      '#abc',
      3
    );
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(1, 1);
    expect(ctx.lineTo).toHaveBeenCalledWith(2, 2);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('renderPathPoints with color=eraser sets destination-out then resets', () => {
    const ctx = makeMockCtx();
    renderPathPoints(
      ctx as unknown as CanvasRenderingContext2D,
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
      'eraser',
      4
    );
    // After the function returns, composite op is reset to source-over so
    // a follow-up renderObject doesn't paint destructively.
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('renderPathPoints with < 2 points is a no-op', () => {
    const ctx = makeMockCtx();
    renderPathPoints(
      ctx as unknown as CanvasRenderingContext2D,
      [{ x: 0, y: 0 }],
      '#000',
      4
    );
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

describe('renderObject rotation', () => {
  it('rotates rect renderers via ctx.translate + ctx.rotate', () => {
    const ctx = makeMockCtx();
    const r: RectObject = {
      id: 'r',
      kind: 'rect',
      z: 0,
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      stroke: '#000',
      strokeWidth: 2,
      rotation: Math.PI / 4,
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, r);
    expect(ctx.translate).toHaveBeenCalledWith(50, 25);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4);
    expect(ctx.translate).toHaveBeenCalledWith(-50, -25);
    // strokeRect still uses the OBJECT's coordinates — the rotation is
    // applied via the transform stack, not by mutating object x/y/w/h.
    expect(ctx.strokeRect).toHaveBeenCalledWith(0, 0, 100, 50);
  });

  it('does NOT rotate lines (endpoint-defined geometry, rotation is implicit)', () => {
    const ctx = makeMockCtx();
    const l: LineObject = {
      id: 'l',
      kind: 'line',
      z: 0,
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      stroke: '#000',
      strokeWidth: 2,
      rotation: Math.PI / 2,
    };
    renderObject(ctx as unknown as CanvasRenderingContext2D, l);
    expect(ctx.translate).not.toHaveBeenCalled();
    expect(ctx.rotate).not.toHaveBeenCalled();
  });
});
