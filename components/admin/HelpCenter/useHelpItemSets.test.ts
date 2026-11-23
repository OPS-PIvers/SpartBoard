import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';

const loadBuildingSet = vi.fn();
const loadWebTourDraft = vi.fn();
vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: (id: string) => loadBuildingSet(id) as unknown,
}));
vi.mock('@/components/tours/webTours', () => ({
  loadWebTourDraft: (id: string) => loadWebTourDraft(id) as unknown,
}));

import { useHelpItemSets } from './useHelpItemSets';

const set = { id: 'a', title: 'A' } as unknown as GuidedLearningSet;

describe('useHelpItemSets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadBuildingSet.mockReset();
    loadWebTourDraft.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('retries a set whose read failed instead of caching it as missing', async () => {
    loadBuildingSet
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(set);
    loadWebTourDraft.mockResolvedValue(null);

    const { result } = renderHook(() => useHelpItemSets(['a'], []));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current?.get('a')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(result.current?.get('a')).toBe(set);
  });

  it('does not retry a set that is genuinely missing', async () => {
    loadBuildingSet.mockResolvedValue(null);
    loadWebTourDraft.mockResolvedValue(null);

    renderHook(() => useHelpItemSets(['a'], []));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(loadBuildingSet).toHaveBeenCalledTimes(1);
  });
});
