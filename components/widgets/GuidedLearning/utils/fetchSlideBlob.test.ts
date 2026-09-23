import { afterEach, describe, expect, it, vi } from 'vitest';

const { getBlob, ref } = vi.hoisted(() => ({
  getBlob: vi.fn(),
  ref: vi.fn((_storage: unknown, url: string) => ({ url })),
}));
vi.mock('firebase/storage', () => ({ getBlob, ref }));
vi.mock('@/config/firebase', () => ({ storage: { name: 'storage' } }));

import { fetchSlideBlob } from './fetchSlideBlob';
import { slideMediaRef } from './slideMedia';

const STORAGE_URL =
  'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/users%2Fu1%2Fhotspot_images%2F1-a.png?alt=media&token=t';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('fetchSlideBlob', () => {
  it('downloads a Drive-hosted slide through the Drive API by file id', async () => {
    const blob = new Blob(['drive']);
    const drive = { downloadFile: vi.fn().mockResolvedValue(blob) };
    await expect(
      fetchSlideBlob('https://lh3.googleusercontent.com/d/abc123', drive)
    ).resolves.toBe(blob);
    expect(drive.downloadFile).toHaveBeenCalledWith('abc123');
    expect(getBlob).not.toHaveBeenCalled();
  });

  it('asks for Drive when a Drive slide has no Drive connection', async () => {
    await expect(
      fetchSlideBlob('https://lh3.googleusercontent.com/d/abc123', null)
    ).rejects.toThrow(/Google Drive/);
  });

  it('reads a Storage slide with getBlob', async () => {
    const blob = new Blob(['storage']);
    getBlob.mockResolvedValue(blob);
    const drive = { downloadFile: vi.fn() };
    await expect(fetchSlideBlob(STORAGE_URL, drive)).resolves.toBe(blob);
    expect(ref).toHaveBeenCalledWith({ name: 'storage' }, STORAGE_URL);
    expect(getBlob).toHaveBeenCalledWith({ url: STORAGE_URL });
    expect(drive.downloadFile).not.toHaveBeenCalled();
  });

  it('falls back to fetch for any other URL', async () => {
    const blob = new Blob(['web']);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchSlideBlob('https://example.com/slide.png', null)
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/slide.png');
  });
});

describe('slideMediaRef', () => {
  it('names the Drive file or Storage path behind a slide', () => {
    expect(slideMediaRef('https://lh3.googleusercontent.com/d/abc123')).toEqual(
      {
        driveFileId: 'abc123',
      }
    );
    expect(slideMediaRef(STORAGE_URL)).toEqual({
      storagePath: 'users/u1/hotspot_images/1-a.png',
    });
  });

  it('never names a shared narration cache path or a foreign URL', () => {
    expect(
      slideMediaRef(
        'https://firebasestorage.googleapis.com/v0/b/app/o/quiz_tts_cache%2Fx.mp3?alt=media'
      )
    ).toBeNull();
    expect(slideMediaRef('https://example.com/slide.png')).toBeNull();
    expect(
      slideMediaRef('https://lh3.googleusercontent.com.evil.test/d/abc')
    ).toBeNull();
  });
});
