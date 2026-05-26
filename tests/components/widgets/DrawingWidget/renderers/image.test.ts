import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
  renderImage,
  _clearImageCacheForTesting,
} from '@/components/widgets/DrawingWidget/renderers/image';
import type { ImageObject } from '@/types';

interface MockCtx {
  save: Mock;
  restore: Mock;
  drawImage: Mock;
  canvas: { width: number; height: number };
  globalCompositeOperation: string;
}

const makeMockCtx = (): MockCtx => ({
  save: vi.fn(),
  restore: vi.fn(),
  drawImage: vi.fn(),
  canvas: { width: 800, height: 600 },
  globalCompositeOperation: 'source-over',
});

const imageObj = (overrides: Partial<ImageObject> = {}): ImageObject => ({
  id: 'img-1',
  kind: 'image',
  z: 0,
  x: 10,
  y: 20,
  w: 100,
  h: 80,
  src: 'https://example.com/test.png',
  ...overrides,
});

describe('renderImage', () => {
  // Hold a reference to the most-recently constructed Image so we can drive
  // its load/error callbacks from the tests.
  let lastImage: HTMLImageElement | null = null;
  let OriginalImage: typeof Image;

  beforeEach(() => {
    _clearImageCacheForTesting();
    lastImage = null;
    OriginalImage = window.Image;
    class StubImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin: string | null = null;
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      private _src = '';
      get src(): string {
        return this._src;
      }
      set src(value: string) {
        this._src = value;
        // Capture every constructed instance; tests dispatch onload manually.
        lastImage = this as unknown as HTMLImageElement;
      }
    }
    // Cast through unknown because the stub deliberately omits unused fields.
    window.Image = StubImage as unknown as typeof Image;
  });

  afterEach(() => {
    window.Image = OriginalImage;
    _clearImageCacheForTesting();
    vi.restoreAllMocks();
  });

  it('on first render, allocates an Image with crossOrigin=anonymous and does not draw', () => {
    const ctx = makeMockCtx();
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj());
    expect(lastImage).not.toBeNull();
    expect(lastImage?.crossOrigin).toBe('anonymous');
    expect(lastImage?.src).toBe('https://example.com/test.png');
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('fires the onLoad callback when the image finishes loading', () => {
    const ctx = makeMockCtx();
    const onLoad = vi.fn();
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj(), onLoad);
    expect(onLoad).not.toHaveBeenCalled();
    lastImage?.onload?.(new Event('load'));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('on subsequent renders after load, draws via ctx.drawImage at the object geometry', () => {
    const ctx = makeMockCtx();
    const onLoad = vi.fn();
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj(), onLoad);
    // Simulate the load completing and the cached element being marked ready.
    if (lastImage) {
      (lastImage as { complete: boolean }).complete = true;
      (lastImage as { naturalWidth: number }).naturalWidth = 300;
      (lastImage as { naturalHeight: number }).naturalHeight = 200;
      lastImage.onload?.(new Event('load'));
    }
    // Second render reuses the cached entry and draws.
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj());
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(lastImage, 10, 20, 100, 80);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('reuses the cache on repeat calls — only one Image is constructed per src', () => {
    const ctx = makeMockCtx();
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj());
    const first = lastImage;
    // Re-render the same src several times — no new Image should be created.
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj());
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj());
    expect(lastImage).toBe(first);
  });

  it('drops failed entries on error so a retry can re-decode', () => {
    const ctx = makeMockCtx();
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj());
    const first = lastImage;
    first?.onerror?.(new Event('error'));
    // Next render should allocate a fresh Image (the failed entry was purged).
    renderImage(ctx as unknown as CanvasRenderingContext2D, imageObj());
    expect(lastImage).not.toBe(first);
  });
});
