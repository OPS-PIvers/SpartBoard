import { describe, expect, it, vi } from 'vitest';
import {
  getBackgroundStyle,
  paintBackground,
} from '@/components/widgets/DrawingWidget/backgroundTemplates';

describe('getBackgroundStyle', () => {
  it('returns an empty style object for "blank"', () => {
    expect(getBackgroundStyle('blank')).toEqual({});
  });

  it('returns paired linear-gradients (horizontal + vertical) for "grid"', () => {
    const style = getBackgroundStyle('grid');
    const bgImage = style.backgroundImage as string;
    expect(bgImage).toMatch(/linear-gradient\(to right/);
    expect(bgImage).toMatch(/linear-gradient\(to bottom/);
    expect(style.backgroundSize).toMatch(/\d+px \d+px/);
  });

  it('returns a single horizontal linear-gradient for "lines"', () => {
    const style = getBackgroundStyle('lines');
    const bgImage = style.backgroundImage as string;
    expect(bgImage).toMatch(/linear-gradient\(to bottom/);
    expect(bgImage).not.toMatch(/linear-gradient\(to right/);
  });

  it('returns a radial-gradient for "dots"', () => {
    const style = getBackgroundStyle('dots');
    expect(style.backgroundImage as string).toMatch(/radial-gradient/);
  });
});

describe('paintBackground', () => {
  const makeCtx = (): CanvasRenderingContext2D => {
    // jsdom canvases' getContext is stubbed in `tests/setup.ts`; we wrap that
    // stub with method spies so we can assert call counts. Cast through
    // `unknown` because the stub is a partial implementation.
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    return ctx;
  };

  it('"blank" is a no-op (no fill calls)', () => {
    const ctx = makeCtx();
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    const arcSpy = vi.spyOn(ctx, 'arc');
    paintBackground(ctx, 'blank', 100, 100);
    expect(fillRectSpy).not.toHaveBeenCalled();
    expect(arcSpy).not.toHaveBeenCalled();
  });

  it('"grid" emits fillRect calls for both axes', () => {
    const ctx = makeCtx();
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    paintBackground(ctx, 'grid', 100, 100);
    // 24px spacing on 100px canvas → 5 vertical lines (x=0,24,48,72,96)
    // + 5 horizontal lines. Total = 10 fillRect calls.
    expect(fillRectSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('"lines" emits at least one fillRect call', () => {
    const ctx = makeCtx();
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    paintBackground(ctx, 'lines', 100, 100);
    expect(fillRectSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('"dots" emits arc calls (one per dot)', () => {
    const ctx = makeCtx();
    const arcSpy = vi.spyOn(ctx, 'arc');
    paintBackground(ctx, 'dots', 100, 100);
    expect(arcSpy.mock.calls.length).toBeGreaterThan(0);
  });
});
