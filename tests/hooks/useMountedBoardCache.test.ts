import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMountedBoardCache } from '@/hooks/useMountedBoardCache';
import type { Dashboard } from '@/types';

vi.mock('@/config/mountedBoardCache', () => ({
  MOUNTED_BOARD_CACHE_SIZE: 2,
}));

const board = (id: string): Dashboard => ({
  id,
  name: id,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  collectionId: null,
});

describe('useMountedBoardCache', () => {
  it('returns just the active Board on first render', () => {
    const all = [board('a'), board('b'), board('c')];
    const { result } = renderHook(() => useMountedBoardCache('a', all));
    expect(result.current.map((d) => d.id)).toEqual(['a']);
  });

  it('keeps the previously-active Board after one switch', () => {
    const all = [board('a'), board('b'), board('c')];
    const { result, rerender } = renderHook(
      ({ activeId }) => useMountedBoardCache(activeId, all),
      { initialProps: { activeId: 'a' } }
    );
    rerender({ activeId: 'b' });
    expect(result.current.map((d) => d.id).sort()).toEqual(['a', 'b']);
  });

  it('evicts the oldest non-active Board when the cap is exceeded', () => {
    const all = [board('a'), board('b'), board('c')];
    const { result, rerender } = renderHook(
      ({ activeId }) => useMountedBoardCache(activeId, all),
      { initialProps: { activeId: 'a' } }
    );
    rerender({ activeId: 'b' });
    rerender({ activeId: 'c' });
    // Cap = 2. 'a' should have been evicted.
    expect(result.current.map((d) => d.id).sort()).toEqual(['b', 'c']);
  });

  it('never evicts a pinned Board', () => {
    const all = [board('a'), board('b'), board('c')];
    const pinned = new Set(['a']);
    const { result, rerender } = renderHook(
      ({ activeId }) => useMountedBoardCache(activeId, all, pinned),
      { initialProps: { activeId: 'a' } }
    );
    rerender({ activeId: 'b' });
    rerender({ activeId: 'c' });
    // 'a' is pinned, must stay. Active is 'c'. Cap is 2 → only 1 LRU slot
    // remains beside the pinned 'a'. 'c' is active so it takes the slot;
    // 'b' is evicted.
    expect(result.current.map((d) => d.id).sort()).toEqual(['a', 'c']);
  });

  it('drops a Board that no longer exists in the dashboard list', () => {
    const initial = [board('a'), board('b')];
    const { result, rerender } = renderHook(
      ({ activeId, all }: { activeId: string; all: Dashboard[] }) =>
        useMountedBoardCache(activeId, all),
      { initialProps: { activeId: 'a', all: initial } }
    );
    rerender({ activeId: 'b', all: initial });
    rerender({ activeId: 'b', all: [board('b')] });
    expect(result.current.map((d) => d.id)).toEqual(['b']);
  });
});
