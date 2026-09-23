import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { doc, getDoc } from 'firebase/firestore';
import { useSubShareContentLoader } from '@/hooks/useSubShareContentLoader';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({
    __path: path.join('/'),
  })),
  getDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockGetDoc = getDoc as Mock;

const bundled = (payload: unknown) => ({
  exists: () => true,
  data: () => ({ kind: 'drawing', itemId: 'w1', bundledAt: 0, payload }),
});

describe('useSubShareContentLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue(bundled({ pages: [] }));
  });

  it('is null outside a share', () => {
    const { result } = renderHook(() => useSubShareContentLoader(null, 0));
    expect(result.current).toBeNull();
  });

  it('reads each item once while the version holds', async () => {
    const { result, rerender } = renderHook(() =>
      useSubShareContentLoader('share-1', 3)
    );

    await result.current?.load('drawing', 'w1');
    rerender();
    await result.current?.load('drawing', 'w1');

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    const ref = (doc as Mock).mock.results[0].value as { __path: string };
    expect(ref.__path).toBe('shared_collections/share-1/content/drawing_w1');
  });

  // The sub accepts a reload without the portal unmounting, so a cache keyed
  // on the share alone would keep serving the teacher's pre-push strokes.
  it('re-reads after the teacher pushes and the sub accepts the new version', async () => {
    const { result, rerender } = renderHook(
      ({ version }: { version: number }) =>
        useSubShareContentLoader('share-1', version),
      { initialProps: { version: 3 } }
    );

    mockGetDoc.mockResolvedValue(bundled({ pages: ['before'] }));
    expect(await result.current?.load('drawing', 'w1')).toEqual({
      pages: ['before'],
    });

    mockGetDoc.mockResolvedValue(bundled({ pages: ['after'] }));
    rerender({ version: 4 });

    expect(result.current?.version).toBe(4);
    expect(await result.current?.load('drawing', 'w1')).toEqual({
      pages: ['after'],
    });
    expect(mockGetDoc).toHaveBeenCalledTimes(2);
  });

  it('caches a missing doc as nothing bundled, so no fallback read happens', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const { result } = renderHook(() => useSubShareContentLoader('share-1', 0));

    expect(await result.current?.load('drawing', 'w1')).toBeNull();
    expect(await result.current?.load('drawing', 'w1')).toBeNull();
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('caches a failed read as nothing bundled rather than retrying forever', async () => {
    mockGetDoc.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSubShareContentLoader('share-1', 0));

    expect(await result.current?.load('drawing', 'w1')).toBeNull();
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });
});

// Keys live in their own sub-collection, which the rules keep to the subs the
// share names, so a refusal is information the widget needs, not an error.
describe('useSubShareContentLoader keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a key from the share’s keys collection', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        kind: 'quiz',
        itemId: 'q-1',
        bundledAt: 0,
        payload: { quiz: { id: 'q-1' } },
      }),
    });
    const { result } = renderHook(() => useSubShareContentLoader('share-1', 3));

    expect(await result.current?.loadKey('quiz', 'q-1')).toEqual({
      payload: { quiz: { id: 'q-1' } },
      denied: false,
    });
    const ref = (doc as Mock).mock.results[0].value as { __path: string };
    expect(ref.__path).toBe('shared_collections/share-1/keys/quiz_q-1');
  });

  it('reads each key once while the version holds', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const { result, rerender } = renderHook(() =>
      useSubShareContentLoader('share-1', 3)
    );

    await result.current?.loadKey('quiz', 'q-1');
    rerender();
    await result.current?.loadKey('quiz', 'q-1');

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('says denied when the rules refuse the read', async () => {
    mockGetDoc.mockRejectedValue({ code: 'permission-denied' });
    const { result } = renderHook(() => useSubShareContentLoader('share-1', 3));

    expect(await result.current?.loadKey('quiz', 'q-1')).toEqual({
      payload: null,
      denied: true,
    });
  });

  // A network blip is not "this share is not yours": the widget should say the
  // key is missing, and a reload can still find it.
  it('does not call an ordinary failure denied', async () => {
    mockGetDoc.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSubShareContentLoader('share-1', 3));

    expect(await result.current?.loadKey('quiz', 'q-1')).toEqual({
      payload: null,
      denied: false,
    });
  });

  it('keeps content and key caches apart', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const { result } = renderHook(() => useSubShareContentLoader('share-1', 3));

    await result.current?.load('quiz', 'q-1');
    await result.current?.loadKey('quiz', 'q-1');

    expect(mockGetDoc).toHaveBeenCalledTimes(2);
  });
});
