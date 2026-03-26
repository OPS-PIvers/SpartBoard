import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppVersion } from '../../hooks/useAppVersion';
import { vi, Mock } from 'vitest';

describe('useAppVersion', () => {
  let globalFetch: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    globalFetch = vi.fn();
    globalThis.fetch = globalFetch;

    // Default mock response: returns 1.0.0
    globalFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ version: '1.0.0', buildDate: '2023-01-01' }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should initialize with updateAvailable as false', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    expect(result.current.updateAvailable).toBe(false);

    await act(async () => {
      await Promise.resolve(); // flush promises
    });

    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it('should detect when a new version is available', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    await act(async () => {
      await Promise.resolve();
    });

    expect(globalFetch).toHaveBeenCalledTimes(1);

    // Mock fetch to return a new version on the next call
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ version: '1.0.1', buildDate: '2023-01-02' }),
    });

    // Advance timers by the interval to trigger the poll
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(true);
    expect(globalFetch).toHaveBeenCalledTimes(2);
  });

  it('should not indicate update available if version is the same', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    await act(async () => {
      await Promise.resolve();
    });

    expect(globalFetch).toHaveBeenCalledTimes(1);

    // Mock fetch to return the same version
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ version: '1.0.0', buildDate: '2023-01-01' }),
    });

    // Advance timers by the interval
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);
    expect(globalFetch).toHaveBeenCalledTimes(2);

    // It should schedule another poll
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ version: '1.0.0', buildDate: '2023-01-01' }),
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(globalFetch).toHaveBeenCalledTimes(3);
    expect(result.current.updateAvailable).toBe(false);
  });

  it('should handle fetch errors gracefully', async () => {
    // Spy on console.error
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { result } = renderHook(() => useAppVersion(1000));

    await act(async () => {
      await Promise.resolve();
    });

    // Mock fetch to fail
    globalFetch.mockRejectedValueOnce(new Error('Network error'));

    // Advance timers
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to check version',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('should handle non-ok responses gracefully', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    await act(async () => {
      await Promise.resolve();
    });

    // Mock fetch to return 404
    globalFetch.mockResolvedValueOnce({
      ok: false,
    });

    // Advance timers
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);
  });

  it('should provide a reloadApp function that reloads the window', async () => {
    // Mock window.location.reload
    const originalLocation = window.location;

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });

    const { result } = renderHook(() => useAppVersion(1000));

    await act(async () => {
      await Promise.resolve();
    });

    result.current.reloadApp();

    expect(
      (window.location as unknown as { reload: Mock }).reload
    ).toHaveBeenCalled();

    // Restore
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('should ignore AbortError', async () => {
    // Spy on console.error
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    // Create an error that mimics AbortError
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';

    globalFetch.mockRejectedValueOnce(abortError);

    const { result } = renderHook(() => useAppVersion(1000));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
