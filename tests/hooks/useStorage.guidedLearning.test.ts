import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useStorage } from '@/hooks/useStorage';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(),
  uploadBytesResumable: vi.fn((r: { path: string }) => ({
    on: (_e: string, _p: unknown, _err: unknown, done: () => void) => done(),
    snapshot: { ref: r },
  })),
  getDownloadURL: vi.fn((r: { path: string }) =>
    Promise.resolve(`https://storage.test/${r.path}`)
  ),
  deleteObject: vi.fn(),
  getStorage: vi.fn(() => ({})),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({ useGoogleDrive: vi.fn() }));

const thumb = vi.hoisted(() => ({
  blob: null as Blob | null,
}));
vi.mock('@/utils/guidedLearningMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/guidedLearningMedia')>()),
  makeSlideThumbnail: () => Promise.resolve(thumb.blob),
}));

const IMMUTABLE = { cacheControl: 'public, max-age=31536000, immutable' };
const drive = {
  uploadFile: vi.fn().mockResolvedValue({ id: 'drive-1' }),
  makePublic: vi.fn().mockResolvedValue(undefined),
};
const slide = () => new File(['x'], 'slide.webp', { type: 'image/webp' });

describe('uploadGuidedLearningImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    thumb.blob = new Blob(['t'], { type: 'image/webp' });
    (useGoogleDrive as Mock).mockReturnValue({ driveService: drive });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  it('puts a district slide and its 400px thumbnail on Storage, cached as immutable', async () => {
    const { result } = renderHook(() => useStorage());
    let out: Awaited<
      ReturnType<ReturnType<typeof useStorage>['uploadGuidedLearningImage']>
    > | null = null;
    await act(async () => {
      out = await result.current.uploadGuidedLearningImage(
        'u1',
        slide(),
        'slide.webp',
        'storage'
      );
    });
    expect(drive.uploadFile).not.toHaveBeenCalled();
    const calls = (uploadBytesResumable as Mock).mock.calls;
    expect(calls.map(([r]) => (r as { path: string }).path)).toEqual([
      'users/u1/hotspot_images/1000-slide.webp',
      'users/u1/hotspot_images/thumbs/1000-slide.webp',
    ]);
    for (const [, , meta] of calls) expect(meta).toEqual(IMMUTABLE);
    expect(out).toEqual({
      url: 'https://storage.test/users/u1/hotspot_images/1000-slide.webp',
      storagePath: 'users/u1/hotspot_images/1000-slide.webp',
      thumbnailUrl:
        'https://storage.test/users/u1/hotspot_images/thumbs/1000-slide.webp',
    });
    expect(ref).toHaveBeenCalledTimes(2);
    expect(getDownloadURL).toHaveBeenCalledTimes(2);
  });

  it('keeps a personal slide on Drive and records its file id', async () => {
    const { result } = renderHook(() => useStorage());
    let out: { url: string; driveFileId?: string } | null = null;
    await act(async () => {
      out = await result.current.uploadGuidedLearningImage(
        'u1',
        slide(),
        'slide.webp'
      );
    });
    expect(uploadBytesResumable).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      url: 'https://lh3.googleusercontent.com/d/drive-1',
      driveFileId: 'drive-1',
    });
  });

  it('falls back to Storage with cacheControl when a personal set has no Drive', async () => {
    (useGoogleDrive as Mock).mockReturnValue({ driveService: null });
    thumb.blob = null;
    const { result } = renderHook(() => useStorage());
    await act(async () => {
      await result.current.uploadGuidedLearningImage(
        'u1',
        slide(),
        'slide.webp'
      );
    });
    const calls = (uploadBytesResumable as Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toEqual(IMMUTABLE);
  });

  it('still returns the slide when the thumbnail upload fails', async () => {
    (uploadBytesResumable as Mock)
      .mockImplementationOnce((r: { path: string }) => ({
        on: (_e: string, _p: unknown, _err: unknown, done: () => void) =>
          done(),
        snapshot: { ref: r },
      }))
      .mockImplementationOnce((r: { path: string }) => ({
        on: (_e: string, _p: unknown, fail: (e: Error) => void) =>
          fail(new Error('quota')),
        snapshot: { ref: r },
      }));
    const { result } = renderHook(() => useStorage());
    let out: { thumbnailUrl?: string; url: string } | null = null;
    await act(async () => {
      out = await result.current.uploadGuidedLearningImage(
        'u1',
        slide(),
        'slide.webp',
        'storage'
      );
    });
    expect(out).toEqual({
      url: 'https://storage.test/users/u1/hotspot_images/1000-slide.webp',
      storagePath: 'users/u1/hotspot_images/1000-slide.webp',
    });
  });
});
