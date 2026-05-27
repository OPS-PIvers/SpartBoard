import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  useImageInsertion,
  type ImageInsertionResult,
} from '@/components/widgets/DrawingWidget/useImageInsertion';

// We mock the two upstream hooks the insertion pipeline depends on. The tests
// assert that paste / drop / picker all converge on the same processAndUpload
// call with skipProcessing: true (whiteboard images should keep their original
// backgrounds) and that the resulting URL flows into `onImageReady` with a
// clamped on-canvas geometry.

const mockUploadDisplayImage = vi.fn();
const mockProcessAndUploadImage = vi.fn();

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploadDisplayImage: mockUploadDisplayImage,
  }),
}));

vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: (opts: { uploadFn?: (file: File) => Promise<string> }) => {
    // Capture the uploadFn so a test can assert it routes through
    // uploadDisplayImage with the user's uid.
    if (opts?.uploadFn) {
      (
        mockProcessAndUploadImage as unknown as { __uploadFn?: unknown }
      ).__uploadFn = opts.uploadFn;
    }
    return {
      processAndUploadImage: mockProcessAndUploadImage,
      uploading: false,
    };
  },
}));

const makeCanvas = (
  internalW = 800,
  internalH = 600,
  rect: Partial<DOMRect> = {}
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = internalW;
  canvas.height = internalH;
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: internalW,
    height: internalH,
    right: internalW,
    bottom: internalH,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
  return canvas;
};

// jsdom doesn't natively load images; stub so readNaturalSize resolves quickly.
class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 400;
  naturalHeight = 300;
  set src(_value: string) {
    // Fire onload on next microtask so the Promise-based decode resolves.
    queueMicrotask(() => this.onload?.());
  }
}

describe('useImageInsertion', () => {
  let OriginalImage: typeof Image;
  let createObjectURL: Mock;
  let revokeObjectURL: Mock;

  beforeEach(() => {
    mockUploadDisplayImage.mockReset();
    mockProcessAndUploadImage.mockReset();
    OriginalImage = window.Image;
    window.Image = StubImage as unknown as typeof Image;
    createObjectURL = vi.fn(() => 'blob:local/test');
    revokeObjectURL = vi.fn();
    (URL as { createObjectURL?: unknown }).createObjectURL = createObjectURL;
    (URL as { revokeObjectURL?: unknown }).revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    window.Image = OriginalImage;
    vi.restoreAllMocks();
  });

  const setup = (canvas: HTMLCanvasElement) => {
    const onImageReady = vi.fn();
    const canvasRef = { current: canvas } as React.RefObject<HTMLCanvasElement>;
    const { result } = renderHook(() =>
      useImageInsertion({ canvasRef, onImageReady })
    );
    return { result, onImageReady };
  };

  it('paste with an image clipboard item uploads via skipProcessing and fires onImageReady', async () => {
    mockProcessAndUploadImage.mockResolvedValue('https://cdn/test.png');
    const canvas = makeCanvas();
    const { result, onImageReady } = setup(canvas);

    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const item = {
      kind: 'file',
      type: 'image/png',
      getAsFile: () => file,
    } as unknown as DataTransferItem;
    const items = [item] as unknown as DataTransferItemList;
    Object.defineProperty(items, 'length', { value: 1 });

    const preventDefault = vi.fn();
    const event = {
      clipboardData: { items } as unknown as DataTransfer,
      preventDefault,
    } as unknown as React.ClipboardEvent;

    await act(async () => {
      result.current.handlePaste(event);
      // Let the microtask queue flush so the image-decode + upload resolve.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(mockProcessAndUploadImage).toHaveBeenCalledTimes(1);
    expect(mockProcessAndUploadImage.mock.calls[0][0]).toBe(file);
    expect(mockProcessAndUploadImage.mock.calls[0][1]).toEqual({
      skipProcessing: true,
    });
    expect(onImageReady).toHaveBeenCalledTimes(1);
    const arg = onImageReady.mock.calls[0][0] as ImageInsertionResult;
    expect(arg.src).toBe('https://cdn/test.png');
    // 400x300 natural, canvas 800x600 → max 400x300 cap fits exactly.
    expect(arg.w).toBe(400);
    expect(arg.h).toBe(300);
    // Centered on the canvas (no focal point for paste).
    expect(arg.x).toBe(200); // (800 - 400) / 2
    expect(arg.y).toBe(150); // (600 - 300) / 2
  });

  it('paste with no image clipboard item is a no-op (no upload, no preventDefault)', async () => {
    const canvas = makeCanvas();
    const { result, onImageReady } = setup(canvas);

    const item = {
      kind: 'string',
      type: 'text/plain',
      getAsFile: () => null,
    } as unknown as DataTransferItem;
    const items = [item] as unknown as DataTransferItemList;
    Object.defineProperty(items, 'length', { value: 1 });
    const preventDefault = vi.fn();
    const event = {
      clipboardData: { items } as unknown as DataTransfer,
      preventDefault,
    } as unknown as React.ClipboardEvent;

    await act(async () => {
      result.current.handlePaste(event);
      await Promise.resolve();
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockProcessAndUploadImage).not.toHaveBeenCalled();
    expect(onImageReady).not.toHaveBeenCalled();
  });

  it('drop with an image file uploads and places the image at the drop point', async () => {
    mockProcessAndUploadImage.mockResolvedValue('https://cdn/dropped.png');
    const canvas = makeCanvas();
    const { result, onImageReady } = setup(canvas);

    const file = new File(['x'], 'dropped.png', { type: 'image/png' });
    const files = [file] as unknown as FileList;
    Object.defineProperty(files, 'length', { value: 1 });
    const preventDefault = vi.fn();
    const event = {
      dataTransfer: { files } as unknown as DataTransfer,
      clientX: 600,
      clientY: 400,
      preventDefault,
    } as unknown as React.DragEvent;

    await act(async () => {
      result.current.handleDrop(event);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(onImageReady).toHaveBeenCalledTimes(1);
    const arg = onImageReady.mock.calls[0][0] as ImageInsertionResult;
    // Image is 400x300 (capped to fit half the canvas); centered on the
    // drop point (600, 400) → x = 600 - 200 = 400, y = 400 - 150 = 250.
    expect(arg.x).toBe(400);
    expect(arg.y).toBe(250);
    expect(arg.w).toBe(400);
    expect(arg.h).toBe(300);
  });

  it('drop with no image (e.g. text/plain) is a no-op', async () => {
    const canvas = makeCanvas();
    const { result, onImageReady } = setup(canvas);

    const file = new File(['x'], 'note.txt', { type: 'text/plain' });
    const files = [file] as unknown as FileList;
    Object.defineProperty(files, 'length', { value: 1 });
    const preventDefault = vi.fn();
    const event = {
      dataTransfer: { files } as unknown as DataTransfer,
      clientX: 100,
      clientY: 100,
      preventDefault,
    } as unknown as React.DragEvent;

    await act(async () => {
      result.current.handleDrop(event);
      await Promise.resolve();
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockProcessAndUploadImage).not.toHaveBeenCalled();
    expect(onImageReady).not.toHaveBeenCalled();
  });

  it('dragOver with a file payload calls preventDefault so drop fires', () => {
    const canvas = makeCanvas();
    const { result } = setup(canvas);

    const preventDefault = vi.fn();
    const event = {
      dataTransfer: { types: ['Files'] } as unknown as DataTransfer,
      preventDefault,
    } as unknown as React.DragEvent;
    result.current.handleDragOver(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('openPicker triggers a click on the hidden file input', () => {
    const canvas = makeCanvas();
    const { result } = setup(canvas);
    // The fileInputProps.ref is internal; spy via the click property of any
    // input that subsequently appears. Easiest: spy on HTMLInputElement.click.
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {
        /* noop spy */
      });
    // Attach the ref to a real input to mirror how the consumer renders it.
    const input = document.createElement('input');
    // Force the ref to point at our input so click is observable.
    (
      result.current.fileInputProps
        .ref as React.MutableRefObject<HTMLInputElement | null>
    ).current = input;
    act(() => result.current.openPicker());
    expect(clickSpy).toHaveBeenCalled();
  });

  it('uploadFn routes through useStorage.uploadDisplayImage with the user uid', async () => {
    mockUploadDisplayImage.mockResolvedValue('https://cdn/from-display.png');
    const canvas = makeCanvas();
    setup(canvas);
    const uploadFn = (
      mockProcessAndUploadImage as unknown as {
        __uploadFn?: (file: File) => Promise<string | null>;
      }
    ).__uploadFn;
    expect(typeof uploadFn).toBe('function');
    if (!uploadFn) throw new Error('uploadFn was not captured');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const url = await uploadFn(file);
    expect(mockUploadDisplayImage).toHaveBeenCalledWith('user-1', file);
    expect(url).toBe('https://cdn/from-display.png');
  });
});
