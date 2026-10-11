import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';
import { useGuidedLearningEditorState } from './useGuidedLearningEditorState';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));

const storageUrl = (name: string) =>
  `https://firebasestorage.googleapis.com/v0/b/b/o/users%2Fteacher-1%2Fhotspot_images%2F${name}?alt=media&token=t`;
const NEW = storageUrl('2-new.webp');
const THUMB = storageUrl('thumbs%2F2-new.webp');
const OLD = storageUrl('1-old.webp');

const storage = vi.hoisted(() => ({
  uploadGuidedLearningImage: vi.fn(),
  uploadGuidedLearningMedia: vi.fn(),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  deleteDriveFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploading: false, ...storage }),
}));

vi.mock('@/utils/guidedLearningMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/guidedLearningMedia')>()),
  prepareImageForUpload: (file: File) =>
    Promise.resolve(new File([file], 'hello.webp', { type: 'image/webp' })),
}));

const baseSet = (
  extra: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Set',
  imageUrls: [storageUrl('slide.webp')],
  steps: [],
  mode: 'structured',
  isBuilding: true,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const png = () => new File(['x'], 'hello.png', { type: 'image/png' });

const render = (set: GuidedLearningSet) =>
  renderHook(() =>
    useGuidedLearningEditorState({ existingSet: set, existingMeta: null })
  ).result;

beforeEach(() => {
  vi.clearAllMocks();
  storage.uploadGuidedLearningImage.mockResolvedValue({
    url: NEW,
    storagePath: 'users/teacher-1/hotspot_images/2-new.webp',
    thumbnailUrl: THUMB,
  });
});

describe('welcome image', () => {
  it('uploads to the media home and deletes the unused thumbnail', async () => {
    const result = render(baseSet());
    await act(() => result.current.setWelcomeImageFromFile(png()));
    expect(storage.uploadGuidedLearningImage).toHaveBeenCalledWith(
      'teacher-1',
      expect.objectContaining({ type: 'image/webp' }),
      'hello.webp',
      'storage'
    );
    expect(result.current.welcomeImageUrl).toBe(NEW);
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'users/teacher-1/hotspot_images/thumbs/2-new.webp'
    );
    expect(result.current.slideThumbnails).not.toHaveProperty(NEW);
  });

  it('refuses a file that is not an image', async () => {
    const result = render(baseSet());
    let ok = true;
    await act(async () => {
      ok = await result.current.setWelcomeImageFromFile(
        new File(['x'], 'clip.mp4', { type: 'video/mp4' })
      );
    });
    expect(ok).toBe(false);
    expect(storage.uploadGuidedLearningImage).not.toHaveBeenCalled();
    expect(result.current.imageError).not.toBe('');
  });

  it('releases a replaced image on close, but not after undo', async () => {
    const result = render(baseSet({ welcomeImageUrl: OLD }));
    await act(() => result.current.setWelcomeImageFromFile(png()));
    const release = vi.fn().mockResolvedValue(undefined);
    await act(() => result.current.flushMediaDeletions(release));
    expect(release).toHaveBeenCalledWith({
      storagePaths: ['users/teacher-1/hotspot_images/1-old.webp'],
      driveFileIds: [],
    });

    const undone = render(baseSet({ welcomeImageUrl: OLD }));
    await act(() => undone.current.setWelcomeImageFromFile(png()));
    act(() => undone.current.undo());
    expect(undone.current.welcomeImageUrl).toBe(OLD);
    const none = vi.fn().mockResolvedValue(undefined);
    await act(() => undone.current.flushMediaDeletions(none));
    expect(none).not.toHaveBeenCalled();
  });

  it('removing the image clears its alt text in one undo step', () => {
    const result = render(
      baseSet({ welcomeImageUrl: OLD, welcomeImageAlt: 'A cell' })
    );
    act(() => result.current.removeWelcomeImage());
    expect(result.current.welcomeImageUrl).toBe('');
    expect(result.current.welcomeImageAlt).toBe('');
    act(() => result.current.undo());
    expect(result.current.welcomeImageUrl).toBe(OLD);
    expect(result.current.welcomeImageAlt).toBe('A cell');
  });
});
