import React, { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePreviewMode } from '@/hooks/usePreviewMode';

const setLocation = (search: string, hash = '', pathname = '/quiz') => {
  // Override the read-only `window.location` for the duration of the test.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      pathname,
      search,
      hash,
      origin: 'https://example.com',
      href: `https://example.com${pathname}${search}${hash}`,
    },
  });
};

describe('usePreviewMode', () => {
  const replaceStateSpy = vi.fn<typeof window.history.replaceState>();

  beforeEach(() => {
    replaceStateSpy.mockReset();
    window.history.replaceState = replaceStateSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when ?preview=1 is present in the URL', () => {
    setLocation('?preview=1');
    const { result } = renderHook(() => usePreviewMode());
    expect(result.current).toBe(true);
  });

  it('returns false when preview flag is absent', () => {
    setLocation('?code=ABC');
    const { result } = renderHook(() => usePreviewMode());
    expect(result.current).toBe(false);
  });

  it('returns false on an empty query string', () => {
    setLocation('');
    const { result } = renderHook(() => usePreviewMode());
    expect(result.current).toBe(false);
  });

  it('strips preview=1 from the URL synchronously on mount', () => {
    setLocation('?code=ABC&preview=1');
    renderHook(() => usePreviewMode());
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/quiz?code=ABC');
  });

  it('produces a clean path when preview=1 is the only query param', () => {
    setLocation('?preview=1', '', '/join');
    renderHook(() => usePreviewMode());
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/join');
  });

  it('preserves hash and other query params when stripping preview', () => {
    setLocation('?code=ABC&preview=1', '#section');
    renderHook(() => usePreviewMode());
    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      '',
      '/quiz?code=ABC#section'
    );
  });

  it('does not call replaceState when preview flag is absent', () => {
    setLocation('?code=ABC');
    renderHook(() => usePreviewMode());
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('captures preview state on first render — value is stable across rerenders', () => {
    setLocation('?preview=1');
    const { result, rerender } = renderHook(() => usePreviewMode());
    expect(result.current).toBe(true);
    // Simulate the URL changing after mount (e.g., the very strip we just
    // performed). The captured value should not flip back to false.
    setLocation('');
    rerender();
    expect(result.current).toBe(true);
  });

  it('returns true and strips the URL under React.StrictMode (initializer purity)', () => {
    // StrictMode double-invokes useState initializers in dev to surface
    // accidental impurities. The hook's initializer is pure (a plain read);
    // the side effect lives in useLayoutEffect, which is idempotent under
    // re-fire. Both invariants must hold for the production behavior to
    // survive StrictMode dev tooling.
    setLocation('?code=ABC&preview=1');
    const { result } = renderHook(() => usePreviewMode(), {
      wrapper: ({ children }: { children: React.ReactNode }) =>
        React.createElement(StrictMode, null, children),
    });
    expect(result.current).toBe(true);
    expect(replaceStateSpy).toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenLastCalledWith(
      null,
      '',
      '/quiz?code=ABC'
    );
  });
});
