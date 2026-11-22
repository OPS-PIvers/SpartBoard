import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizStimulus } from '@/types';
import { usePaperTestStimulusFiles } from './usePaperTestStimulusFiles';

const drive: {
  driveService: { exportAsPdf: ReturnType<typeof vi.fn> } | null;
  getDriveFileAsBlob: ReturnType<typeof vi.fn>;
} = { driveService: null, getDriveFileAsBlob: vi.fn() };
vi.mock('./useGoogleDrive', () => ({ useGoogleDrive: () => drive }));
vi.mock('@/utils/paperSheetStimulusImages', () => ({
  browserStimulusImageDeps: () => ({}),
  // An image whose load never settles.
  resolveStimulusImages: (items: unknown[]) =>
    items.length ? new Promise(() => undefined) : Promise.resolve({ src: {} }),
}));
vi.mock('@/utils/paperSheetPdfPage', () => ({
  openPdfPages: () =>
    Promise.resolve({
      pageCount: 2,
      render: () => Promise.resolve({ blob: new Blob(['png']) }),
      close: () => undefined,
    }),
}));
vi.mock('@/utils/quizStimuli', () => ({
  driveMediaUrl: (id: string) => `https://media/${id}`,
  drivePdfExportUrl: (id: string) => `https://export/${id}`,
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

describe('usePaperTestStimulusFiles with a pasted Google Doc', () => {
  const docId = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
  const pasted = [
    {
      id: 'doc',
      type: 'gdoc-embed',
      label: '',
      url: `https://docs.google.com/document/d/${docId}/edit`,
    },
  ] as unknown as QuizStimulus[];
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF'])),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:page',
      revokeObjectURL: () => undefined,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    drive.driveService = null;
  });

  it('prints its pages from the teacher Drive export', async () => {
    const exportAsPdf = vi.fn().mockResolvedValue(new Blob(['%PDF']));
    drive.driveService = { exportAsPdf };
    const { result } = renderHook(() => usePaperTestStimulusFiles(pasted));
    await vi.waitFor(() => expect(result.current.loading).toBe(false));
    expect(exportAsPdf).toHaveBeenCalledWith(docId);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.files.pages.doc).toEqual(['blob:page', 'blob:page']);
  });

  it('falls back to the public export when the teacher has no access', async () => {
    drive.driveService = {
      exportAsPdf: vi.fn().mockRejectedValue(new Error('404')),
    };
    const { result } = renderHook(() => usePaperTestStimulusFiles(pasted));
    await vi.waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith(
      `https://export/${docId}`,
      expect.anything()
    );
    expect(result.current.files.pages.doc).toHaveLength(2);
  });

  it('uses only the public export for a teammate print', async () => {
    const exportAsPdf = vi.fn();
    drive.driveService = { exportAsPdf };
    const { result } = renderHook(() =>
      usePaperTestStimulusFiles(pasted, { publicOnly: true })
    );
    await vi.waitFor(() => expect(result.current.loading).toBe(false));
    expect(exportAsPdf).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://export/${docId}`,
      expect.anything()
    );
    expect(result.current.files.pages.doc).toHaveLength(2);
  });

  it('keeps the pages that loaded when a later doc hits the overall cap', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const slowId = '9ZyXwVuTsRqPoNmLkJiHgFe';
      const two = [
        ...pasted,
        {
          id: 'slow',
          type: 'gdoc-embed',
          label: '',
          url: `https://docs.google.com/document/d/${slowId}/edit`,
        },
      ] as unknown as QuizStimulus[];
      fetchMock.mockImplementation((url: string) =>
        url.includes(slowId)
          ? new Promise(() => undefined)
          : Promise.resolve({
              ok: true,
              blob: () => Promise.resolve(new Blob(['%PDF'])),
            })
      );
      const { result } = renderHook(() =>
        usePaperTestStimulusFiles(two, { publicOnly: true })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.files.pages.doc).toHaveLength(2);
      expect(result.current.files.pages.slow).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
