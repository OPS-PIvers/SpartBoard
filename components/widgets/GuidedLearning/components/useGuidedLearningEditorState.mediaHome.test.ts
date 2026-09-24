import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';
import { useGuidedLearningEditorState } from './useGuidedLearningEditorState';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));

const SLIDE =
  'https://firebasestorage.googleapis.com/v0/b/b/o/users%2Fteacher-1%2Fhotspot_images%2F1-a.webp?alt=media&token=t';
const THUMB =
  'https://firebasestorage.googleapis.com/v0/b/b/o/users%2Fteacher-1%2Fhotspot_images%2Fthumbs%2F1-a.webp?alt=media&token=u';

const storage = vi.hoisted(() => ({
  uploadGuidedLearningImage: vi.fn(),
  uploadGuidedLearningMedia: vi.fn(),
  uploadHotspotImage: vi.fn(),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  deleteDriveFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploading: false, ...storage }),
}));

const prepared = vi.hoisted(() => ({ calls: [] as File[] }));
vi.mock('@/utils/guidedLearningMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/guidedLearningMedia')>()),
  prepareImageForUpload: (file: File) => {
    prepared.calls.push(file);
    return Promise.resolve(
      new File([file], file.name.replace(/\.\w+$/, '.webp'), {
        type: 'image/webp',
      })
    );
  },
}));

const baseSet = (extra: Partial<GuidedLearningSet>): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Set',
  imageUrls: ['https://lh3.googleusercontent.com/d/old-id'],
  steps: [],
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const png = () => new File(['x'], 'shot.png', { type: 'image/png' });

beforeEach(() => {
  vi.clearAllMocks();
  prepared.calls = [];
  storage.uploadGuidedLearningImage.mockResolvedValue({
    url: SLIDE,
    storagePath: 'users/teacher-1/hotspot_images/1-a.webp',
    thumbnailUrl: THUMB,
  });
});

describe('slide uploads go to the set’s media home', () => {
  it.each([
    ['a building set', { isBuilding: true }, 'storage'],
    ['a Help Center set', { isBuilding: true, helpCenter: true }, 'storage'],
    ['a personal set', {}, 'drive'],
  ] as const)('%s uploads to %s', async (_label, extra, home) => {
    const { result } = renderHook(() =>
      useGuidedLearningEditorState({
        existingSet: baseSet(extra),
        existingMeta: null,
      })
    );
    await act(() => result.current.uploadFromFiles([png()]));
    expect(storage.uploadGuidedLearningImage).toHaveBeenCalledWith(
      'teacher-1',
      expect.objectContaining({ type: 'image/webp' }),
      'shot.webp',
      home
    );
    expect(storage.uploadHotspotImage).not.toHaveBeenCalled();
    expect(result.current.imageUrls).toContain(SLIDE);
  });

  it('keeps the Storage thumbnail for the new slide', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningEditorState({
        existingSet: baseSet({ isBuilding: true }),
        existingMeta: null,
      })
    );
    await act(() => result.current.uploadFromFiles([png()]));
    expect(result.current.slideThumbnails).toEqual({ [SLIDE]: THUMB });
  });

  it('prepares a redacted slide and uploads it to the set’s home', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningEditorState({
        existingSet: baseSet({ isBuilding: true }),
        existingMeta: null,
      })
    );
    const redacted = new Blob(['r'], { type: 'image/webp' });
    let ok = false;
    await act(async () => {
      ok = await result.current.replaceSlideImage(0, redacted);
    });
    expect(ok).toBe(true);
    expect(prepared.calls[0].name).toBe('redacted.webp');
    expect(storage.uploadGuidedLearningImage).toHaveBeenCalledWith(
      'teacher-1',
      expect.objectContaining({ type: 'image/webp' }),
      'redacted.webp',
      'storage'
    );
    expect(result.current.imageUrls).toEqual([SLIDE]);
  });
});
