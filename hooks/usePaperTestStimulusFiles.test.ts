import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizStimulus } from '@/types';
import { usePaperTestStimulusFiles } from './usePaperTestStimulusFiles';

const drive = { driveService: null, getDriveFileAsBlob: vi.fn() };
vi.mock('./useGoogleDrive', () => ({ useGoogleDrive: () => drive }));
vi.mock('@/utils/paperSheetStimulusImages', () => ({
  browserStimulusImageDeps: () => ({}),
  // An image whose load never settles.
  resolveStimulusImages: () => new Promise(() => undefined),
}));

const stalled = [
  { id: 's1', type: 'image', label: 'A', url: 'https://example.com/a.png' },
] as unknown as QuizStimulus[];

describe('usePaperTestStimulusFiles', () => {
  beforeEach(() =>
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  );
  afterEach(() => vi.useRealTimers());

  it('stops loading after the overall cap when an image never settles', async () => {
    const { result } = renderHook(() => usePaperTestStimulusFiles(stalled));
    expect(result.current.loading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.files).toEqual({ images: {}, pages: {} });
  });
});
