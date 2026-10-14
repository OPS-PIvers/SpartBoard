import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WhiteboardStartingPage } from '@/types';
import { useStartingPageImage } from './useStartingPageImage';

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

const withImage: WhiteboardStartingPage = {
  pattern: { kind: 'blank' },
  image: {
    driveFileId: 'f1',
    url: 'https://drive.google.com/file/d/f1/view',
    mimeType: 'image/png',
    width: 800,
    height: 600,
  },
};

describe('useStartingPageImage', () => {
  afterEach(() => {
    created.length = 0;
    vi.unstubAllGlobals();
  });

  it('returns null and loads nothing without an image', () => {
    vi.stubGlobal('Image', FakeImage);
    const { result } = renderHook(() =>
      useStartingPageImage({ pattern: { kind: 'grid' } })
    );
    expect(result.current.image).toBeNull();
    expect(result.current.ready).toBe(true);
    expect(created).toHaveLength(0);
  });

  it('loads the lh3 image with CORS so the export is not tainted', async () => {
    vi.stubGlobal('Image', FakeImage);
    const { result } = renderHook(() => useStartingPageImage(withImage));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.image).not.toBeNull());
    expect(result.current.ready).toBe(true);
    expect(created[0].crossOrigin).toBe('anonymous');
    expect(created[0].url).toBe('https://lh3.googleusercontent.com/d/f1');
  });

  it('reports a failed load and loads again on retry', async () => {
    vi.stubGlobal('Image', FakeImage);
    failNext = true;
    const { result } = renderHook(() => useStartingPageImage(withImage));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.ready).toBe(false);

    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(created).toHaveLength(2);
  });
});
