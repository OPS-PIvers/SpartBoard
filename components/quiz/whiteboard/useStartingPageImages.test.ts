import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WhiteboardStartingPage } from '@/types';
import { useStartingPageImages } from './useStartingPageImages';

const created: FakeImage[] = [];
let failNext = false;
class FakeImage {
  crossOrigin = '';
  url = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    created.push(this);
  }
  set src(url: string) {
    this.url = url;
    const fail = failNext;
    failNext = false;
    queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
  }
}

const IMAGE = {
  driveFileId: 'f1',
  url: 'https://drive.google.com/file/d/f1/view',
  mimeType: 'image/png',
  width: 800,
  height: 600,
};
const withImage: WhiteboardStartingPage = {
  pattern: { kind: 'blank' },
  image: IMAGE,
};

describe('useStartingPageImages', () => {
  afterEach(() => {
    created.length = 0;
    vi.unstubAllGlobals();
  });

  it('returns null and loads nothing without an image', () => {
    vi.stubGlobal('Image', FakeImage);
    const { result } = renderHook(() =>
      useStartingPageImages({ pattern: { kind: 'grid' } })
    );
    expect(result.current.images.size).toBe(0);
    expect(result.current.ready).toBe(true);
    expect(created).toHaveLength(0);
  });

  it('loads the lh3 image with CORS so the export is not tainted', async () => {
    vi.stubGlobal('Image', FakeImage);
    const { result } = renderHook(() => useStartingPageImages(withImage));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.images.get('f1')).toBeTruthy());
    expect(result.current.ready).toBe(true);
    expect(created[0].crossOrigin).toBe('anonymous');
    expect(created[0].url).toBe('https://lh3.googleusercontent.com/d/f1');
  });

  it('reports a failed load and loads again on retry', async () => {
    vi.stubGlobal('Image', FakeImage);
    failNext = true;
    const { result } = renderHook(() => useStartingPageImages(withImage));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.ready).toBe(false);

    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(created).toHaveLength(2);
  });

  it('loads every placed image once and reports ready only when all decode', async () => {
    vi.stubGlobal('Image', FakeImage);
    const base = { ...IMAGE };
    const spec: WhiteboardStartingPage = {
      pattern: { kind: 'blank' },
      images: [
        { ...base, x: 0, y: 0, w: 100, h: 75 },
        { ...base, driveFileId: 'f2', x: 200, y: 0, w: 100, h: 75 },
        { ...base, x: 400, y: 0, w: 100, h: 75 },
      ],
    };
    const { result } = renderHook(() => useStartingPageImages(spec));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(created.map((c) => c.url)).toEqual([
      'https://lh3.googleusercontent.com/d/f1',
      'https://lh3.googleusercontent.com/d/f2',
    ]);
    expect([...result.current.images.keys()]).toEqual(['f1', 'f2']);
  });

  it('does not reload when an image only moves', async () => {
    vi.stubGlobal('Image', FakeImage);
    const placed = { ...IMAGE, x: 0, y: 0, w: 100, h: 75 };
    const { result, rerender } = renderHook(
      (spec: WhiteboardStartingPage) => useStartingPageImages(spec),
      { initialProps: { pattern: { kind: 'blank' }, images: [placed] } }
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    rerender({ pattern: { kind: 'blank' }, images: [{ ...placed, x: 50 }] });
    expect(result.current.ready).toBe(true);
    expect(created).toHaveLength(1);
  });
});
