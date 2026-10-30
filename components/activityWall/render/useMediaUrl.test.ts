import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaUrl } from './useMediaUrl';
import { makeSubmission } from './fixtures';

const { mockGetDownloadURL } = vi.hoisted(() => ({
  mockGetDownloadURL: vi.fn(() =>
    Promise.resolve('https://storage.test/photo.png')
  ),
}));

vi.mock('@/config/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  getDownloadURL: mockGetDownloadURL,
  ref: (_storage: unknown, path: string) => path,
}));

describe('useMediaUrl', () => {
  beforeEach(() => {
    mockGetDownloadURL.mockClear();
  });

  it('resolves the storagePath of an upload in transit', async () => {
    const path = 'activity_wall_media/t_wall/sub-1/photo.png';
    const { result } = renderHook(() =>
      useMediaUrl(
        makeSubmission({ type: 'photo', content: path, storagePath: path })
      )
    );
    await waitFor(() =>
      expect(result.current.url).toBe('https://storage.test/photo.png')
    );
    expect(mockGetDownloadURL).toHaveBeenCalledWith(path);
  });

  it('never resolves a Storage path carried only in content', async () => {
    const { result } = renderHook(() =>
      useMediaUrl(
        makeSubmission({
          type: 'photo',
          content: 'quiz_response_media/other/quiz/answer.webm',
          storagePath: undefined,
        })
      )
    );
    await Promise.resolve();
    expect(mockGetDownloadURL).not.toHaveBeenCalled();
    expect(result.current.url).toBeNull();
  });

  it('still shows an http(s) content URL', () => {
    const { result } = renderHook(() =>
      useMediaUrl(
        makeSubmission({
          type: 'photo',
          content: 'https://example.com/p.jpg',
          storagePath: undefined,
        })
      )
    );
    expect(result.current.url).toBe('https://example.com/p.jpg');
  });
});
