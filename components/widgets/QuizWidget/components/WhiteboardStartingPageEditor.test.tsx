import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  WhiteboardPlacedImage,
  WhiteboardStartingImage,
  WhiteboardStartingPage,
} from '@/types';
import { WhiteboardInsertImageModal } from './WhiteboardInsertImageModal';
import { WhiteboardStartingPagePreviewModal } from './WhiteboardStartingPagePreviewModal';
import {
  appendInkPoint,
  defaultImagePlacement,
  hitCorner,
  moveRect,
  resizeFromCorner,
  strokeHit,
  withEdits,
} from './whiteboardStartingPageEdit';

const IMG: WhiteboardStartingImage = {
  driveFileId: 'f1',
  url: 'https://lh3.googleusercontent.com/d/f1',
  mimeType: 'image/png',
  width: 800,
  height: 600,
};

describe('starting page edit geometry', () => {
  it('places a new image centred within 60% of the page and cascades the next', () => {
    expect(defaultImagePlacement(IMG, 0)).toMatchObject({
      x: 320,
      y: 240,
      w: 960,
      h: 720,
    });
    expect(defaultImagePlacement(IMG, 1)).toMatchObject({ x: 368, y: 288 });
  });

  it('keeps a moved image on the page', () => {
    const r = { x: 100, y: 100, w: 400, h: 300 };
    expect(moveRect(r, 50, -20)).toEqual({ x: 150, y: 80, w: 400, h: 300 });
    expect(moveRect(r, 5000, -5000)).toEqual({ x: 1200, y: 0, w: 400, h: 300 });
  });

  it('resizes from a corner with the opposite corner fixed and the aspect kept', () => {
    const r = { x: 100, y: 100, w: 400, h: 300 };
    expect(resizeFromCorner(r, 'se', 700, 400)).toEqual({
      x: 100,
      y: 100,
      w: 600,
      h: 450,
    });
    expect(resizeFromCorner(r, 'nw', 300, 250)).toEqual({
      x: 300,
      y: 250,
      w: 200,
      h: 150,
    });
    // Never past the page edge.
    const big = resizeFromCorner(r, 'se', 5000, 5000);
    expect(big.x + big.w).toBeLessThanOrEqual(1600);
    expect(big.y + big.h).toBeCloseTo(1200);
    expect(big.w / big.h).toBeCloseTo(4 / 3);
  });

  it('finds a corner handle and a stroke under the pointer', () => {
    const r = { x: 100, y: 100, w: 400, h: 300 };
    expect(hitCorner(r, 505, 398, 10)).toBe('se');
    expect(hitCorner(r, 300, 250, 10)).toBeNull();
    const stroke = { color: '#000', size: 4, points: [0, 0, 100, 0] };
    expect(strokeHit(stroke, 50, 6, 5)).toBe(true);
    expect(strokeHit(stroke, 50, 30, 5)).toBe(false);
  });

  it('rounds ink points, skips tiny moves and stops at the point budget', () => {
    expect(appendInkPoint([], 10.4, 20.6, 10)).toEqual([10, 21]);
    expect(appendInkPoint([10, 21], 15, 21, 10)).toEqual([10, 21]);
    expect(appendInkPoint([10, 21], 30, 21, 1)).toEqual([10, 21]);
  });

  it('writes images and drops the legacy image', () => {
    const placed = { ...IMG, x: 0, y: 0, w: 10, h: 10 };
    expect(
      withEdits({ pattern: { kind: 'grid' }, image: IMG }, [placed], [])
    ).toEqual({ pattern: { kind: 'grid' }, images: [placed] });
  });
});

const InsertHarness: React.FC<{
  initial?: WhiteboardPlacedImage[];
  upload: (file: File) => Promise<WhiteboardStartingImage | null>;
  spy: (images: WhiteboardPlacedImage[]) => void;
}> = ({ initial = [], upload, spy }) => {
  const [images, setImages] = useState(initial);
  return (
    <WhiteboardInsertImageModal
      images={images}
      onUploadImage={upload}
      onChange={(next) => {
        spy(next);
        setImages(next);
      }}
      onClose={vi.fn()}
    />
  );
};

const fileInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"]');

describe('WhiteboardInsertImageModal', () => {
  it('uploads several chosen files and shows a thumbnail for each', async () => {
    const upload = vi.fn((file: File) =>
      Promise.resolve({ ...IMG, driveFileId: file.name.replace('.png', '') })
    );
    const spy = vi.fn();
    render(<InsertHarness upload={upload} spy={spy} />);
    expect(screen.getByText('Choose files')).toBeInTheDocument();
    expect(
      screen.getByText('Drop images here, or press Ctrl+V to paste.')
    ).toBeInTheDocument();
    const input = fileInput();
    expect(input?.multiple).toBe(true);
    act(() => {
      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.png', { type: 'image/png' }),
            new File(['t'], 'notes.txt', { type: 'text/plain' }),
            new File(['b'], 'b.png', { type: 'image/png' }),
          ],
        },
      });
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenCalledTimes(2);
    const last = spy.mock.calls[1][0] as WhiteboardPlacedImage[];
    expect(last.map((i) => i.driveFileId)).toEqual(['a', 'b']);
    expect(last[1].x - last[0].x).toBe(48);
    expect(
      screen.getByRole('button', { name: 'Remove image 2' })
    ).toBeInTheDocument();
  });

  it('adds a pasted image', async () => {
    const upload = vi.fn(() => Promise.resolve(IMG));
    const spy = vi.fn();
    render(<InsertHarness upload={upload} spy={spy} />);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { files: [new File(['a'], 'a.png', { type: 'image/png' })] },
    });
    act(() => {
      document.dispatchEvent(paste);
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('removes one image and stops adding at six', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      ...IMG,
      driveFileId: `f${i}`,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    }));
    const spy = vi.fn();
    render(<InsertHarness initial={six} upload={vi.fn()} spy={spy} />);
    expect(screen.getByText('Up to 6 images.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove image 3' }));
    expect(
      (spy.mock.calls[0][0] as WhiteboardPlacedImage[]).map(
        (i) => i.driveFileId
      )
    ).toEqual(['f0', 'f1', 'f3', 'f4', 'f5']);
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  });
});

// The canvas is drawn at 800x600 CSS px, so one pixel is two page units.
const openEditor = (page: WhiteboardStartingPage) => {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <WhiteboardStartingPagePreviewModal
      page={page}
      onChange={onChange}
      onClose={onClose}
    />
  );
  const canvas = screen.getByLabelText('Starting page preview');
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  const at = (
    type: 'pointerDown' | 'pointerMove' | 'pointerUp',
    x: number,
    y: number
  ) => fireEvent[type](canvas, { clientX: x, clientY: y, pointerId: 1 });
  return { canvas, at, onChange, onClose };
};

const pageWithImage: WhiteboardStartingPage = {
  pattern: { kind: 'grid' },
  images: [{ ...IMG, x: 100, y: 100, w: 400, h: 300 }],
};

const saved = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls[0][0] as WhiteboardStartingPage;

describe('WhiteboardStartingPagePreviewModal', () => {
  it('moves the image under the pointer and saves it', () => {
    const { at, onChange, onClose } = openEditor(pageWithImage);
    at('pointerDown', 100, 100);
    at('pointerMove', 150, 125);
    at('pointerUp', 150, 125);
    expect(
      screen.getByRole('button', { name: 'Remove image' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved(onChange).images?.[0]).toMatchObject({
      x: 200,
      y: 150,
      w: 400,
      h: 300,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('resizes from a corner handle keeping the aspect ratio', () => {
    const { at, onChange } = openEditor(pageWithImage);
    at('pointerDown', 100, 100);
    at('pointerUp', 100, 100);
    at('pointerDown', 250, 200);
    at('pointerMove', 350, 200);
    at('pointerUp', 350, 200);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved(onChange).images?.[0]).toMatchObject({
      x: 100,
      y: 100,
      w: 600,
      h: 450,
    });
  });

  it('grabs a corner with a finger from a 48px target', () => {
    const { canvas, onChange } = openEditor(pageWithImage);
    const touch = (
      type: 'pointerDown' | 'pointerMove' | 'pointerUp',
      x: number,
      y: number
    ) =>
      fireEvent[type](canvas, {
        clientX: x,
        clientY: y,
        pointerId: 2,
        pointerType: 'touch',
      });
    touch('pointerDown', 100, 100);
    touch('pointerUp', 100, 100);
    touch('pointerDown', 265, 215);
    touch('pointerMove', 365, 215);
    touch('pointerUp', 365, 215);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved(onChange).images?.[0]).toMatchObject({ x: 100, y: 100 });
    expect(saved(onChange).images?.[0].w).toBeGreaterThan(400);
  });

  it('selects, moves and resizes an image from the keyboard', () => {
    const { canvas, onChange } = openEditor(pageWithImage);
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(canvas, { key: '+' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const img = saved(onChange).images?.[0];
    expect(img).toMatchObject({ x: 110, y: 150 });
    expect(img?.w).toBeCloseTo(440);
    expect(img?.h).toBeCloseTo(330);
  });

  it('removes the selected image with the Delete key', () => {
    const { canvas, at, onChange } = openEditor(pageWithImage);
    at('pointerDown', 100, 100);
    at('pointerUp', 100, 100);
    fireEvent.keyDown(canvas, { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved(onChange)).toEqual({ pattern: { kind: 'grid' } });
  });

  it('draws a pen stroke, erases it, and clears ink', () => {
    const { at, onChange } = openEditor({ pattern: { kind: 'blank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pen' }));
    at('pointerDown', 10, 10);
    at('pointerMove', 50, 10);
    at('pointerMove', 100, 10);
    at('pointerUp', 100, 10);
    at('pointerDown', 10, 300);
    at('pointerMove', 60, 300);
    at('pointerUp', 60, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }));
    at('pointerDown', 50, 300);
    at('pointerUp', 50, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved(onChange).ink).toEqual([
      { color: '#0f172a', size: 4, points: [20, 20, 100, 20, 200, 20] },
    ]);
  });

  it('clears all ink', () => {
    const { onChange } = openEditor({
      pattern: { kind: 'blank' },
      ink: [{ color: '#0f172a', size: 4, points: [1, 1, 5, 5] }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear ink' }));
    expect(screen.getByRole('button', { name: 'Clear ink' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved(onChange)).toEqual({ pattern: { kind: 'blank' } });
  });

  it('discards every change on Cancel', () => {
    const { at, onChange, onClose } = openEditor(pageWithImage);
    at('pointerDown', 100, 100);
    at('pointerMove', 300, 300);
    at('pointerUp', 300, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
