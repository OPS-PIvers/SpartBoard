import { describe, it, expect, vi, Mock } from 'vitest';
import { renderSelectionChrome } from '@/components/widgets/DrawingWidget/renderers/selection';
import type { LineObject, RectObject } from '@/types';

// Minimal ctx mock — only the fields the chrome renderer touches.
interface MockCtx {
  save: Mock;
  restore: Mock;
  beginPath: Mock;
  moveTo: Mock;
  lineTo: Mock;
  stroke: Mock;
  fill: Mock;
  arc: Mock;
  setLineDash: Mock;
  strokeRect: Mock;
  fillRect: Mock;
  translate: Mock;
  rotate: Mock;
  globalAlpha: number;
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
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  setLineDash: vi.fn(),
  strokeRect: vi.fn(),
  fillRect: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  strokeStyle: '#000',
  fillStyle: '#000',
  lineWidth: 1,
});

const rectObj = (overrides: Partial<RectObject> = {}): RectObject => ({
  id: 'r',
  kind: 'rect',
  z: 0,
  x: 0,
  y: 0,
  w: 100,
  h: 50,
  stroke: '#000',
  strokeWidth: 2,
  ...overrides,
});

describe('renderSelectionChrome', () => {
  it('paints a bbox stroke + 8 resize squares + 1 rotation circle', () => {
    const ctx = makeMockCtx();
    renderSelectionChrome(
      ctx as unknown as CanvasRenderingContext2D,
      rectObj(),
      null,
      1
    );
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    // Bounding box dashed stroke.
    expect(ctx.strokeRect).toHaveBeenCalled();
    // 8 resize squares = 8 fillRect calls + 8 strokeRect calls (plus the
    // bbox above, total 9 strokeRect).
    expect(ctx.fillRect).toHaveBeenCalledTimes(8);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(9);
    // Rotation handle uses arc() once.
    expect(ctx.arc).toHaveBeenCalledTimes(1);
  });

  it('rotates the chrome around the bbox center for kinds that honor rotation', () => {
    const ctx = makeMockCtx();
    const rotated = rectObj({
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      rotation: Math.PI / 2,
    });
    renderSelectionChrome(
      ctx as unknown as CanvasRenderingContext2D,
      rotated,
      null,
      1
    );
    // The implementation mutates the ctx transform via translate/rotate/
    // translate around the bbox center (50, 25). Verify all three were
    // called with the expected arguments.
    const translateCalls = ctx.translate.mock.calls;
    expect(translateCalls.length).toBeGreaterThanOrEqual(2);
    expect(translateCalls[0]).toEqual([50, 25]);
    // The matching un-translate happens after the rotate.
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(translateCalls[1]).toEqual([-50, -25]);
  });

  it('does NOT rotate the chrome for kinds that ignore rotation (lines)', () => {
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
      // Even with a non-zero rotation field, lines ignore it.
      rotation: Math.PI / 2,
    };
    renderSelectionChrome(
      ctx as unknown as CanvasRenderingContext2D,
      l,
      null,
      1
    );
    expect(ctx.translate).not.toHaveBeenCalled();
    expect(ctx.rotate).not.toHaveBeenCalled();
  });

  it('dims handles when an active transform is in progress', () => {
    const ctx = makeMockCtx();
    renderSelectionChrome(
      ctx as unknown as CanvasRenderingContext2D,
      rectObj(),
      { active: true },
      1
    );
    expect(ctx.globalAlpha).toBeLessThan(1);
  });

  it('scales sizes inversely with the scale argument so handles stay 10 screen-px at zoom', () => {
    const ctx = makeMockCtx();
    renderSelectionChrome(
      ctx as unknown as CanvasRenderingContext2D,
      rectObj({ x: 0, y: 0, w: 100, h: 50 }),
      null,
      0.5 // canvas rendered at 2x its internal size
    );
    // At scale=0.5, handleSize = 10 / 0.5 = 20 → half = 10.
    // The NW square at bbox (0,0) draws as fillRect(-10, -10, 20, 20).
    const fillRectCalls = ctx.fillRect.mock.calls;
    expect(fillRectCalls).toContainEqual([-10, -10, 20, 20]);
  });
});
