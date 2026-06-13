import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useRemoteConnection } from './useRemoteConnection';

describe('useRemoteConnection', () => {
  it('starts connected and updates lastSyncedAt when markSynced is called', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-06-13T10:00:00Z'));
    const { result } = renderHook(() => useRemoteConnection());
    expect(result.current.status).toBe('connected');
    expect(result.current.lastSyncedAt).toBeNull();
    act(() => {
      result.current.markSynced();
    });
    expect(result.current.lastSyncedAt).toBe(
      Date.parse('2026-06-13T10:00:00Z')
    );
    vi.useRealTimers();
  });

  it('reports reconnecting when the browser goes offline', () => {
    const { result } = renderHook(() => useRemoteConnection());
    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: false,
      });
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.status).toBe('reconnecting');
  });
});
