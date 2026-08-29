import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useAppVersion,
  __resetAppVersionForTests,
} from '@/hooks/useAppVersion';
import { vi, Mock } from 'vitest';

// The hook reads the build-time constant __APP_BUILD_ID__.
// In tests Vite's `define` isn't active, so we shim the global ourselves.
declare let __APP_BUILD_ID__: string;

const versionPayload = (buildId?: string) => ({
  ok: true,
  json: () =>
    Promise.resolve({
      version: '2026.06.03',
      buildDate: '2023-01-01',
      ...(buildId === undefined ? {} : { buildId }),
    }),
});

describe('useAppVersion', () => {
  let globalFetch: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    globalFetch = vi.fn();
    globalThis.fetch = globalFetch;

    // Set a known build id for tests (non-'dev' so polling starts)
    (globalThis as Record<string, unknown>).__APP_BUILD_ID__ = 'abc123def456';

    // Default mock response: returns the same build id as the running bundle
    globalFetch.mockResolvedValue(versionPayload('abc123def456'));

    // Reset the module-level singleton so each test gets a fresh polling loop.
    __resetAppVersionForTests();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    __resetAppVersionForTests();
    delete (globalThis as Record<string, unknown>).__APP_BUILD_ID__;
  });

  it('should initialize with updateAvailable as false', () => {
    const { result } = renderHook(() => useAppVersion(1000));
    expect(result.current.updateAvailable).toBe(false);
    // No initial fetch — the build id is baked in
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('should detect when a new build is available', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    // Mock fetch to return a new build id on the first poll
    globalFetch.mockResolvedValueOnce(versionPayload('999fedcba321'));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(true);
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it('should detect a new build even when the changelog version is unchanged', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    // Same curated `version`, different commit — the case that previously
    // left the reload prompt permanently silent between changelog entries.
    globalFetch.mockResolvedValueOnce(versionPayload('999fedcba321'));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  it('should not indicate update available if the build id is the same', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    // Advance to first poll — returns same build id
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);
    expect(globalFetch).toHaveBeenCalledTimes(1);

    // Advance to second poll — still same build id
    globalFetch.mockResolvedValueOnce(versionPayload('abc123def456'));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(globalFetch).toHaveBeenCalledTimes(2);
    expect(result.current.updateAvailable).toBe(false);
  });

  it('should keep polling when the response has no buildId', async () => {
    const { result } = renderHook(() => useAppVersion(1000));

    // A deployment predating buildId — not comparable, so no prompt.
    globalFetch.mockResolvedValueOnce(versionPayload(undefined));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(false);

    // Polling continues, so a later deploy is still detected.
    globalFetch.mockResolvedValueOnce(versionPayload('999fedcba321'));

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(true);
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
    globalFetch.mockResolvedValueOnce(versionPayload('999fedcba321'));

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

  it('should not poll when the build id is dev', async () => {
    (globalThis as Record<string, unknown>).__APP_BUILD_ID__ = 'dev';

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
