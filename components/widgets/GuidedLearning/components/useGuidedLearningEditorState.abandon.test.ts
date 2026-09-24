import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGuidedLearningEditorState } from './useGuidedLearningEditorState';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));

const storage = vi.hoisted(() => ({
  resolveUpload: null as ((url: string) => void) | null,
  deleteFile: vi.fn().mockResolvedValue(undefined),
  deleteDriveFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(
      () =>
        new Promise<string>((resolve) => {
          storage.resolveUpload = resolve;
        })
    ),
    uploadGuidedLearningMedia: vi.fn(),
    deleteFile: storage.deleteFile,
    deleteDriveFile: storage.deleteDriveFile,
  }),
}));

vi.mock('@/utils/guidedLearningMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/guidedLearningMedia')>()),
  prepareImageForUpload: (file: File) => Promise.resolve(file),
}));

describe('abandonUploads', () => {
  it('deletes an upload that lands after the author closed, and adds no slide', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningEditorState({ existingSet: null, existingMeta: null })
    );
    const file = new File(['x'], 'slide.png', { type: 'image/png' });
    let upload: Promise<void> = Promise.resolve();
    act(() => {
      upload = result.current.uploadFromFiles([file]);
    });
    await vi.waitFor(() => expect(storage.resolveUpload).not.toBeNull());
    act(() => result.current.abandonUploads());
    await act(async () => {
      storage.resolveUpload?.(
        'https://lh3.googleusercontent.com/d/drive-file-1'
      );
      await upload;
    });
    expect(result.current.imageUrls).toEqual([]);
    expect(storage.deleteDriveFile).toHaveBeenCalledWith('drive-file-1');
  });
});
