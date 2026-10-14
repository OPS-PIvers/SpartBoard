import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawableObject, WhiteboardStartingPage } from '@/types';
import {
  WHITEBOARD_PICTURE_TARGET_BYTES,
  renderWhiteboardPicture,
} from './whiteboardPicture';

const calls: string[] = [];
vi.mock('@/utils/whiteboard/startingPage', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  drawStartingPage: () => calls.push('starting-page'),
}));
vi.mock('@/components/widgets/DrawingWidget/renderers/dispatcher', () => ({
  renderObject: (_ctx: unknown, obj: DrawableObject) =>
    calls.push(`ink:${obj.id}`),
}));

const path = (id: string, z: number, color = '#000'): DrawableObject => ({
  id,
  kind: 'path',
  z,
  color,
  width: 4,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
});

describe('renderWhiteboardPicture', () => {
  afterEach(() => {
    calls.length = 0;
    vi.restoreAllMocks();
  });

  it('paints ink on its own layer and composites it over the starting page', async () => {
    const page: WhiteboardStartingPage = { pattern: { kind: 'blank' } };
    const contexts: { drawImage: ReturnType<typeof vi.fn> }[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => {
        const ctx = {
          setTransform: vi.fn(),
          drawImage: vi.fn(() => calls.push('composite')),
        };
        contexts.push(ctx);
        return ctx as unknown as CanvasRenderingContext2D;
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      function (this: HTMLCanvasElement, cb: BlobCallback) {
        expect([this.width, this.height]).toEqual([3200, 2400]);
        cb(new Blob(['png'], { type: 'image/png' }));
      }
    );

    const blob = await renderWhiteboardPicture(
      [path('b', 2), path('a', 1, 'eraser')],
      page
    );

    expect(blob.type).toBe('image/png');
    expect(calls).toEqual(['starting-page', 'ink:a', 'ink:b', 'composite']);
    expect(contexts[0].drawImage).toHaveBeenCalledTimes(1);
    expect(contexts[1].drawImage).not.toHaveBeenCalled();
  });

  it('steps the picture down in size until it fits under the upload cap', async () => {
    const page: WhiteboardStartingPage = { pattern: { kind: 'blank' } };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          setTransform: vi.fn(),
          drawImage: vi.fn(),
        }) as unknown as CanvasRenderingContext2D
    );
    const widths: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      function (this: HTMLCanvasElement, cb: BlobCallback) {
        widths.push(this.width);
        const big = this.width > 1600;
        const blob = new Blob(['png'], { type: 'image/png' });
        Object.defineProperty(blob, 'size', {
          value: big ? WHITEBOARD_PICTURE_TARGET_BYTES + 1 : 1024,
        });
        cb(blob);
      }
    );

    const blob = await renderWhiteboardPicture([], page);

    expect(widths).toEqual([3200, 2400, 1600]);
    expect(blob.size).toBe(1024);
  });
});
