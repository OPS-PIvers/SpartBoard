import { describe, it, expect } from 'vitest';
import type { DrawableObject } from '@/types';
import {
  IDENTITY_VIEW,
  boxToPage,
  clampViewZoom,
  fitView,
  pinchView,
  steppedZoom,
  viewBackgroundStyle,
  visiblePageArea,
  zoomViewAround,
} from './viewport';

const size = { width: 400, height: 200 };

describe('whiteboard viewport math', () => {
  it('clamps zoom to 25%-400%', () => {
    expect(clampViewZoom(0.1)).toBe(0.25);
    expect(clampViewZoom(9)).toBe(4);
  });

  it('keeps the anchor point still while zooming', () => {
    const at = { x: 100, y: 50 };
    const before = boxToPage(IDENTITY_VIEW, at);
    const zoomed = zoomViewAround(IDENTITY_VIEW, 2, at);
    expect(boxToPage(zoomed, at)).toEqual(before);
    expect(zoomed.zoom).toBe(2);
  });

  it('steps through preset zooms and stops at the ends', () => {
    expect(steppedZoom(1, 1)).toBe(1.25);
    expect(steppedZoom(1, -1)).toBe(0.75);
    expect(steppedZoom(1.1, -1)).toBe(1);
    expect(steppedZoom(4, 1)).toBe(4);
    expect(steppedZoom(0.25, -1)).toBe(0.25);
  });

  it('pinch keeps the page point under the fingers and pans with them', () => {
    const start = { zoom: 1, x: 0, y: 0 };
    const a0 = { x: 100, y: 100 };
    const b0 = { x: 200, y: 100 };
    const pageMid = boxToPage(start, { x: 150, y: 100 });
    const next = pinchView(
      start,
      a0,
      b0,
      { x: 60, y: 120 },
      { x: 260, y: 120 }
    );
    expect(next.zoom).toBe(2);
    const mid = boxToPage(next, { x: 160, y: 120 });
    expect(mid.x).toBeCloseTo(pageMid.x);
    expect(mid.y).toBeCloseTo(pageMid.y);
  });

  it('visible area is the page rectangle on screen', () => {
    const v = { zoom: 2, x: -100, y: -50 };
    expect(visiblePageArea(v, size)).toEqual({
      x: 50,
      y: 25,
      width: 200,
      height: 100,
    });
  });

  it('fit returns 100% when everything is on the page', () => {
    const rect: DrawableObject = {
      id: 'r',
      kind: 'rect',
      z: 0,
      x: 10,
      y: 10,
      w: 50,
      h: 50,
      stroke: '#000',
      strokeWidth: 2,
    };
    expect(fitView([rect], size)).toBe(IDENTITY_VIEW);
  });

  it('fit zooms out to show objects drawn off the page', () => {
    const rect: DrawableObject = {
      id: 'r',
      kind: 'rect',
      z: 0,
      x: 300,
      y: 0,
      w: 500,
      h: 100,
      stroke: '#000',
      strokeWidth: 0,
    };
    const v = fitView([rect], size);
    expect(v.zoom).toBeLessThan(1);
    const area = visiblePageArea(v, size);
    expect(area.x).toBeLessThanOrEqual(0);
    expect(area.x + area.width).toBeGreaterThanOrEqual(800);
  });

  it('background tiles scale and move with the page', () => {
    expect(
      viewBackgroundStyle(
        { backgroundImage: 'x', backgroundSize: '24px 24px' },
        { zoom: 2, x: 5, y: -3 }
      )
    ).toEqual({
      backgroundImage: 'x',
      backgroundSize: '48px 48px',
      backgroundPosition: '5px -3px',
    });
    expect(
      viewBackgroundStyle(
        { backgroundSize: '100% 32px' },
        { zoom: 0.5, x: 0, y: 0 }
      ).backgroundSize
    ).toBe('100% 16px');
  });
});
