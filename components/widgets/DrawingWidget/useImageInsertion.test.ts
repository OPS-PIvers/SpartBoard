import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type React from 'react';
import { useImageInsertion } from './useImageInsertion';

const upload = vi.hoisted(() => vi.fn(() => Promise.resolve('https://x/img')));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadDisplayImage: vi.fn() }),
}));
vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: () => ({ processAndUploadImage: upload, uploading: false }),
}));

const setup = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const onImageReady = vi.fn();
  const { result } = renderHook(() =>
    useImageInsertion({ canvasRef: { current: canvas }, onImageReady })
  );
  return { result, onImageReady };
};

const imageFile = () => new File(['x'], 'a.png', { type: 'image/png' });

const pasteEvent = (target: EventTarget) => {
  const file = imageFile();
  const e = new Event('paste', { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(e, 'target', { value: target });
  Object.defineProperty(e, 'clipboardData', {
    value: {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
    },
  });
  return e;
};

describe('useImageInsertion with the shared image picker', () => {
  beforeEach(() => upload.mockClear());

  it('leaves a paste inside the picker panel to the picker', () => {
    const { result } = setup();
    const panel = document.createElement('div');
    panel.setAttribute('data-image-picker-panel', 'true');
    const button = document.createElement('button');
    panel.appendChild(button);
    const e = pasteEvent(button);
    result.current.handleNativePaste(e);
    expect(e.defaultPrevented).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('still takes a paste on the canvas', () => {
    const { result } = setup();
    const e = pasteEvent(document.createElement('canvas'));
    result.current.handleNativePaste(e);
    expect(e.defaultPrevented).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('skips a drop the picker already took', () => {
    const { result } = setup();
    const drop = {
      defaultPrevented: true,
      preventDefault: vi.fn(),
      dataTransfer: { files: [imageFile()] },
      clientX: 0,
      clientY: 0,
    } as unknown as React.DragEvent;
    result.current.handleDrop(drop);
    expect(upload).not.toHaveBeenCalled();
  });

  it('places a picked image at the canvas center and returns its URL', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onerror?.());
        }
      }
    );
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const { result, onImageReady } = setup();
    await expect(result.current.pickerUpload(imageFile())).resolves.toBe(
      'https://x/img'
    );
    expect(onImageReady).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'https://x/img', x: 300, y: 200 })
    );
    vi.unstubAllGlobals();
  });
});
