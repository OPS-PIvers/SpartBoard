import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import {
  useInSubShare,
  useShareContent,
  useShareKey,
} from '@/hooks/useShareContent';

const wrapWith = (
  load: (kind: string, itemId: string) => Promise<unknown>,
  version = 0
) => {
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={{
          shareId: 'share-1',
          version,
          load: load as never,
          loadKey: noSubShareKey,
        }}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  }
  return InShare;
};

describe('useShareContent', () => {
  // The teacher's own path must be untouched: every widget calls this hook,
  // and outside /subs there is no share to read.
  it('is off outside a share', () => {
    const { result } = renderHook(() => useShareContent('drawing', 'w1'));
    expect(result.current).toEqual({ status: 'off', payload: null });
  });

  it('loads the bundled payload for the item asked for', async () => {
    const load = vi.fn().mockResolvedValue({ pages: [] });
    const { result } = renderHook(() => useShareContent('drawing', 'w1'), {
      wrapper: wrapWith(load),
    });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.payload).toEqual({ pages: [] });
    expect(load).toHaveBeenCalledWith('drawing', 'w1');
  });

  // 'missing' has to be distinguishable from 'off', or a widget would fall
  // back to the viewer's own library and show the sub someone else's work.
  it('reports missing when nothing was bundled for the item', async () => {
    const { result } = renderHook(() => useShareContent('drawing', 'w1'), {
      wrapper: wrapWith(vi.fn().mockResolvedValue(null)),
    });

    await waitFor(() => expect(result.current.status).toBe('missing'));
    expect(result.current.payload).toBeNull();
  });

  it('goes back to loading when the item changes', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ pages: ['one'] })
      .mockResolvedValueOnce({ pages: ['two'] });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useShareContent('drawing', id),
      { wrapper: wrapWith(load), initialProps: { id: 'w1' } }
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ id: 'w2' });
    expect(result.current.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.payload).toEqual({ pages: ['two'] })
    );
  });

  // A teacher's push bumps the version while the widget stays mounted; the
  // hook has to go back to loading and re-read, or the sub keeps looking at
  // the pre-push copy.
  it('re-reads the item when the content version changes', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ pages: ['before'] })
      .mockResolvedValueOnce({ pages: ['after'] });
    let version = 0;
    function InShare({ children }: { children: React.ReactNode }) {
      return (
        <SubShareContentContext.Provider
          value={{
            shareId: 'share-1',
            version,
            load: load as never,
            loadKey: noSubShareKey,
          }}
        >
          {children}
        </SubShareContentContext.Provider>
      );
    }
    const { result, rerender } = renderHook(
      () => useShareContent('drawing', 'w1'),
      { wrapper: InShare }
    );

    await waitFor(() =>
      expect(result.current.payload).toEqual({ pages: ['before'] })
    );

    version = 1;
    rerender();
    expect(result.current.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.payload).toEqual({ pages: ['after'] })
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stays off when the widget has no item id', () => {
    const load = vi.fn();
    const { result } = renderHook(() => useShareContent('drawing', null), {
      wrapper: wrapWith(load),
    });
    expect(result.current.status).toBe('off');
    expect(load).not.toHaveBeenCalled();
  });
});

describe('useInSubShare', () => {
  it('is false outside a share', () => {
    const { result } = renderHook(() => useInSubShare());
    expect(result.current).toBe(false);
  });

  // A widget pointing at nothing yet reads 'off' from useShareContent inside a
  // share too, so only this can keep it off the substitute's own library.
  it('is true inside a share even with no item to load', () => {
    const { result } = renderHook(() => useInSubShare(), {
      wrapper: wrapWith(vi.fn()),
    });
    expect(result.current).toBe(true);
  });
});

describe('useShareKey', () => {
  const wrapWithKey = (
    loadKey: (kind: string, itemId: string) => Promise<unknown>
  ) => {
    function InShare({ children }: { children: React.ReactNode }) {
      return (
        <SubShareContentContext.Provider
          value={{
            shareId: 'share-1',
            version: 0,
            load: (() => Promise.resolve(null)) as never,
            loadKey: loadKey as never,
          }}
        >
          {children}
        </SubShareContentContext.Provider>
      );
    }
    return InShare;
  };

  it('is off outside a share', () => {
    const { result } = renderHook(() => useShareKey('quiz', 'q-1'));
    expect(result.current).toEqual({ status: 'off', payload: null });
  });

  it('loads the bundled key for the item asked for', async () => {
    const loadKey = vi
      .fn()
      .mockResolvedValue({ payload: { quiz: { id: 'q-1' } }, denied: false });
    const { result } = renderHook(() => useShareKey('quiz', 'q-1'), {
      wrapper: wrapWithKey(loadKey),
    });

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.payload).toEqual({ quiz: { id: 'q-1' } });
    expect(loadKey).toHaveBeenCalledWith('quiz', 'q-1');
  });

  // A viewer holding the link who is not a named sub reads content/ but not
  // keys/, and saying "missing" would blame the teacher for their own rules.
  it('reports denied when the share does not name this reader', async () => {
    const { result } = renderHook(() => useShareKey('quiz', 'q-1'), {
      wrapper: wrapWithKey(
        vi.fn().mockResolvedValue({ payload: null, denied: true })
      ),
    });

    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current.payload).toBeNull();
  });

  it('reports missing when no key was bundled for the item', async () => {
    const { result } = renderHook(() => useShareKey('quiz', 'q-1'), {
      wrapper: wrapWithKey(
        vi.fn().mockResolvedValue({ payload: null, denied: false })
      ),
    });

    await waitFor(() => expect(result.current.status).toBe('missing'));
  });

  it('goes back to loading when the item changes', async () => {
    const loadKey = vi
      .fn()
      .mockResolvedValueOnce({
        payload: { quiz: { id: 'one' } },
        denied: false,
      })
      .mockResolvedValueOnce({
        payload: { quiz: { id: 'two' } },
        denied: false,
      });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useShareKey('quiz', id),
      { wrapper: wrapWithKey(loadKey), initialProps: { id: 'q-1' } }
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ id: 'q-2' });
    expect(result.current.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.payload).toEqual({ quiz: { id: 'two' } })
    );
  });
});
