import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

const getDocs = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: (...args: unknown[]): Promise<unknown> => getDocs(...args),
}));

import { useStandardsCatalog } from './useStandardsCatalog';

const snapOf = (
  docs: Array<{ id: string; data: Record<string, unknown> }>
) => ({
  forEach: (cb: (d: { id: string; data: () => unknown }) => void) =>
    docs.forEach((d) => cb({ id: d.id, data: () => d.data })),
});

const bench = {
  id: 'mn:1.1.1.1',
  data: { code: '1.1.1.1', text: 'Read', searchText: '1.1.1.1 read' },
};

describe('useStandardsCatalog caching', () => {
  beforeEach(() => getDocs.mockReset());

  it('refetches after an empty result but caches a populated one', async () => {
    getDocs.mockResolvedValueOnce(snapOf([]));
    const first = renderHook(() => useStandardsCatalog());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.benchmarks).toEqual([]);
    first.unmount();

    getDocs.mockResolvedValueOnce(snapOf([bench]));
    const second = renderHook(() => useStandardsCatalog());
    await waitFor(() =>
      expect(second.result.current.benchmarks).toHaveLength(1)
    );
    second.unmount();

    const third = renderHook(() => useStandardsCatalog());
    await waitFor(() => expect(third.result.current.loading).toBe(false));
    expect(third.result.current.benchmarks).toHaveLength(1);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});
