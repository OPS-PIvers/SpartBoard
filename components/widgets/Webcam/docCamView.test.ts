import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_VIEW,
  OCR_MAX_SIDE,
  clampPan,
  clampZoom,
  mediaBox,
  normalizeRotation,
  nextRotation,
  stepZoom,
  toOcrDataUrl,
  zoomAt,
} from './docCamView';

const size = { width: 400, height: 300 };

describe('docCamView', () => {
  it('clamps zoom to 1x-4x and treats junk as 1x', () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('normalizes rotation to quarter turns', () => {
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(nextRotation(270)).toBe(0);
  });

  it('steps through the zoom presets', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1.7, -1)).toBe(1.5);
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(1, -1)).toBe(1);
  });

  it('never pans an empty edge into view', () => {
    expect(clampPan({ ...DEFAULT_VIEW, panX: 50 }, size).panX).toBe(0);
    const zoomed = clampPan(
      { ...DEFAULT_VIEW, zoom: 2, panX: 999, panY: -999 },
      size
    );
    expect(zoomed.panX).toBe(200);
    expect(zoomed.panY).toBe(-150);
  });

  it('keeps the point under the cursor still while zooming', () => {
    const focal = { x: 100, y: 50 };
    const next = zoomAt(DEFAULT_VIEW, 2, focal, size);
    // Content point under the cursor before: (focal - pan) / zoom.
    expect((focal.x - next.panX) / next.zoom).toBeCloseTo(focal.x);
    expect((focal.y - next.panY) / next.zoom).toBeCloseTo(focal.y);
  });

  it('swaps the media box when turned sideways so it still fills the feed', () => {
    expect(mediaBox(0, size)).toEqual({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
    });
    expect(mediaBox(90, size)).toEqual({
      left: 50,
      top: -50,
      width: 300,
      height: 400,
    });
  });
});

describe('toOcrDataUrl', () => {
  const canvasOf = (width: number, height: number) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  };

  it('keeps a small capture as PNG', () => {
    const c = canvasOf(1280, 720);
    const spy = vi.spyOn(c, 'toDataURL').mockReturnValue('data:image/png;x');
    expect(toOcrDataUrl(c)).toBe('data:image/png;x');
    expect(spy).toHaveBeenCalledWith('image/png');
  });

  it('scales a 4K capture down to the OCR limit as JPEG', () => {
    const big = canvasOf(3840, 2160);
    const made: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = create(tag);
        if (el instanceof HTMLCanvasElement) {
          vi.spyOn(el, 'getContext').mockReturnValue({
            drawImage: vi.fn(),
          } as unknown as CanvasRenderingContext2D);
          vi.spyOn(el, 'toDataURL').mockReturnValue('data:image/jpeg;x');
          made.push(el);
        }
        return el;
      });
    expect(toOcrDataUrl(big)).toBe('data:image/jpeg;x');
    expect(made[0].width).toBe(OCR_MAX_SIDE);
    expect(made[0].height).toBe(1152);
    createSpy.mockRestore();
  });
});
