import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { useSubShareDrawingObjects } from '@/components/widgets/DrawingWidget/useSubShareDrawingObjects';
import type { DrawableObject } from '@/types';

const stroke = (id: string, z = 1): DrawableObject =>
  ({ id, z, kind: 'pen' }) as unknown as DrawableObject;

const BUNDLED = {
  pages: [
    { pageId: 'p1', objects: [stroke('teacher-1')] },
    { pageId: 'p2', objects: [stroke('teacher-2')] },
  ],
};

const wrapWith = (load: () => Promise<unknown>) => {
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={{ shareId: 'share-1', version: 0, load: load as never }}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  }
  return InShare;
};

describe('useSubShareDrawingObjects', () => {
  it('is inactive outside a share, so the teacher reads their own canvas', () => {
    const { result } = renderHook(() => useSubShareDrawingObjects('w1', 'p1'));
    expect(result.current.active).toBe(false);
    expect(result.current.objects).toEqual([]);
  });

  it('shows the teacher’s strokes for the page on screen', async () => {
    const { result } = renderHook(() => useSubShareDrawingObjects('w1', 'p1'), {
      wrapper: wrapWith(vi.fn().mockResolvedValue(BUNDLED)),
    });

    expect(result.current.active).toBe(true);
    await waitFor(() =>
      expect(result.current.objects).toEqual([stroke('teacher-1')])
    );
  });

  it('follows the sub to another page of the same drawing', async () => {
    const { result, rerender } = renderHook(
      ({ page }: { page: string }) => useSubShareDrawingObjects('w1', page),
      {
        wrapper: wrapWith(vi.fn().mockResolvedValue(BUNDLED)),
        initialProps: { page: 'p1' },
      }
    );

    await waitFor(() =>
      expect(result.current.objects).toEqual([stroke('teacher-1')])
    );
    rerender({ page: 'p2' });
    await waitFor(() =>
      expect(result.current.objects).toEqual([stroke('teacher-2')])
    );
  });

  // The sub is a different signed-in user: their strokes would otherwise land
  // in their own account, outlive the share and survive Reset.
  it('keeps what the sub draws in memory, on top of the teacher’s', async () => {
    const { result } = renderHook(() => useSubShareDrawingObjects('w1', 'p1'), {
      wrapper: wrapWith(vi.fn().mockResolvedValue(BUNDLED)),
    });

    await waitFor(() => expect(result.current.objects).toHaveLength(1));
    await act(async () => {
      await result.current.addObject(stroke('sub-1', 2));
    });
    expect(result.current.objects.map((o) => o.id)).toEqual([
      'teacher-1',
      'sub-1',
    ]);

    await act(async () => {
      await result.current.removeObject('teacher-1');
    });
    expect(result.current.objects.map((o) => o.id)).toEqual(['sub-1']);

    await act(async () => {
      await result.current.clear();
    });
    expect(result.current.objects).toEqual([]);
  });

  it('renders an empty canvas when the drawing was not bundled', async () => {
    const { result } = renderHook(() => useSubShareDrawingObjects('w1', 'p1'), {
      wrapper: wrapWith(vi.fn().mockResolvedValue(null)),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe(true);
    expect(result.current.objects).toEqual([]);
  });
});
