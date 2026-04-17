import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSortableReorder } from '@/components/common/library/useSortableReorder';

interface Item {
  id: string;
  label: string;
}

const makeItems = (ids: string[]): Item[] =>
  ids.map((id) => ({ id, label: id.toUpperCase() }));

const getId = (item: Item) => item.id;

describe('useSortableReorder', () => {
  it('returns the items in their original order by default', () => {
    const items = makeItems(['a', 'b', 'c']);
    const onCommit = vi.fn();

    const { result } = renderHook(() =>
      useSortableReorder({ items, getId, onCommit })
    );

    expect(result.current.orderedItems.map(getId)).toEqual(['a', 'b', 'c']);
    expect(result.current.isCommitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('optimistically reorders before the commit resolves', async () => {
    const items = makeItems(['a', 'b', 'c']);
    let resolveCommit: (() => void) | null = null;
    const onCommit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCommit = resolve;
        })
    );

    const { result } = renderHook(() =>
      useSortableReorder({ items, getId, onCommit })
    );

    // Fire the reorder but don't await it yet.
    let reorderPromise: Promise<void> | undefined;
    act(() => {
      reorderPromise = result.current.handleReorder(['c', 'a', 'b']);
    });

    // Optimistic update landed.
    expect(result.current.orderedItems.map(getId)).toEqual(['c', 'a', 'b']);
    expect(result.current.isCommitting).toBe(true);
    expect(onCommit).toHaveBeenCalledWith(['c', 'a', 'b']);

    // Let the commit finish.
    await act(async () => {
      resolveCommit?.();
      await reorderPromise;
    });

    expect(result.current.orderedItems.map(getId)).toEqual(['c', 'a', 'b']);
    expect(result.current.isCommitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('clears a prior error after a successful commit', async () => {
    const items = makeItems(['a', 'b', 'c']);
    const onCommit = vi
      .fn<(ids: string[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useSortableReorder({ items, getId, onCommit })
    );

    await act(async () => {
      await result.current.handleReorder(['b', 'a', 'c']);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('nope');
    // Reverted.
    expect(result.current.orderedItems.map(getId)).toEqual(['a', 'b', 'c']);

    await act(async () => {
      await result.current.handleReorder(['c', 'b', 'a']);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.orderedItems.map(getId)).toEqual(['c', 'b', 'a']);
  });

  it('reverts the order and captures the error when commit rejects', async () => {
    const items = makeItems(['a', 'b', 'c']);
    const onCommit = vi.fn().mockRejectedValue(new Error('persist failed'));

    const { result } = renderHook(() =>
      useSortableReorder({ items, getId, onCommit })
    );

    await act(async () => {
      await result.current.handleReorder(['c', 'a', 'b']);
    });

    expect(result.current.orderedItems.map(getId)).toEqual(['a', 'b', 'c']);
    expect(result.current.isCommitting).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('persist failed');
  });

  it('re-syncs orderedItems when the items prop id set changes', () => {
    const initial = makeItems(['a', 'b', 'c']);
    const onCommit = vi.fn();

    const { result, rerender } = renderHook(
      ({ items }) => useSortableReorder({ items, getId, onCommit }),
      { initialProps: { items: initial } }
    );

    expect(result.current.orderedItems.map(getId)).toEqual(['a', 'b', 'c']);

    const next = makeItems(['a', 'd', 'e']);
    rerender({ items: next });

    expect(result.current.orderedItems.map(getId)).toEqual(['a', 'd', 'e']);
  });

  it('preserves optimistic order when prop items update but id set is unchanged', async () => {
    const first = makeItems(['a', 'b', 'c']);
    const onCommit = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ items }) => useSortableReorder({ items, getId, onCommit }),
      { initialProps: { items: first } }
    );

    await act(async () => {
      await result.current.handleReorder(['c', 'a', 'b']);
    });
    expect(result.current.orderedItems.map(getId)).toEqual(['c', 'a', 'b']);

    // Consumer sends a new items array with identical ids but updated labels
    // (e.g. Firestore snapshot delivered fresh data).
    const refreshed: Item[] = [
      { id: 'a', label: 'AAA' },
      { id: 'b', label: 'BBB' },
      { id: 'c', label: 'CCC' },
    ];
    rerender({ items: refreshed });

    await waitFor(() => {
      expect(result.current.orderedItems.map(getId)).toEqual(['c', 'a', 'b']);
    });
    expect(result.current.orderedItems.find((i) => i.id === 'a')?.label).toBe(
      'AAA'
    );
  });

  it('does not loop when the caller passes a fresh array reference on every render', () => {
    // Regression: when a caller's parent re-renders and computes items via
    // useMemo with an unstable dep (e.g. an inline searchFields callback),
    // `items` arrives as a new array reference each render with identical
    // ids and order. A previous implementation re-seeded state in that case,
    // causing an infinite render loop (React error #301).
    const onCommit = vi.fn();

    const { rerender, result } = renderHook(
      ({ items }) => useSortableReorder({ items, getId, onCommit }),
      { initialProps: { items: makeItems(['a', 'b', 'c']) } }
    );

    // Simulate many parent renders, each passing a fresh array wrapper with
    // the same logical contents. If this loops, renderHook throws.
    for (let i = 0; i < 5; i++) {
      rerender({ items: makeItems(['a', 'b', 'c']) });
    }

    expect(result.current.orderedItems.map(getId)).toEqual(['a', 'b', 'c']);
  });
});
