import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppVersion } from '../../hooks/useAppVersion';
import { vi, Mock } from 'vitest';

// The hook reads the build-time constant __APP_VERSION__.
// In tests Vite's `define` isn't active, so we shim the global ourselves.
declare let __APP_VERSION__: string;

describe('useAppVersion', () => {
  let globalFetch: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    globalFetch = vi.fn();
    globalThis.fetch = globalFetch;

    // Set a known build version for tests (non-'dev' so polling starts)
    (globalThis as Record<string, unknown>).__APP_VERSION__ = '1.0.0';

    // Default mock response: returns the same version as the build
    globalFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ version: '1.0.0', buildDate: '2023-01-01' }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).__APP_VERSION__;
  });

  it('should initialize with updateAvailable as false', () => {
    const { result } = renderHook(() => useAppVersion(1000));
    expect(result.current.updateAvailable).toBe(false);
    // No initial fetch — the build version is baked in
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('should detect when a new version is available', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    // Mock fetch to return a new version on the first poll
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ version: '1.0.1', buildDate: '2023-01-02' }),
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(true);
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it('should not indicate update available if version is the same', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    // Advance to first poll — returns same version
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);
    expect(globalFetch).toHaveBeenCalledTimes(1);

    // Advance to second poll — still same version
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ version: '1.0.0', buildDate: '2023-01-01' }),
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(globalFetch).toHaveBeenCalledTimes(2);
    expect(result.current.updateAvailable).toBe(false);
  });

  it('should handle fetch errors gracefully and keep polling', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { result } = renderHook(() => useAppVersion(1000));

    // First poll fails
    globalFetch.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to check version',
      expect.any(Error)
    );

    // Should schedule another poll even after error
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ version: '1.0.1', buildDate: '2023-01-02' }),
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(true);

    consoleSpy.mockRestore();
  });

  it('should handle non-ok responses gracefully', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    // First poll returns 404
    globalFetch.mockResolvedValueOnce({ ok: false });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);
  });

  it('should provide a reloadApp function that reloads the window', () => {
    const originalLocation = window.location;

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });

    const { result } = renderHook(() => useAppVersion(1000));

    result.current.reloadApp();

    expect(
      (window.location as unknown as { reload: Mock }).reload
    ).toHaveBeenCalled();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('should not poll when build version is dev', async () => {
    (globalThis as Record<string, unknown>).__APP_VERSION__ = 'dev';

    const { result } = renderHook(() => useAppVersion(1000));

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(globalFetch).not.toHaveBeenCalled();
    expect(result.current.updateAvailable).toBe(false);
  });

  it('should ignore AbortError', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    globalFetch.mockRejectedValueOnce(abortError);

    renderHook(() => useAppVersion(1000));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
