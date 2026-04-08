import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsMobile } from '@/hooks/useIsMobile';
import * as useWindowSizeModule from '@/hooks/useWindowSize';

vi.mock('@/hooks/useWindowSize');

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when width is 0 (SSR / pre-paint)', () => {
    vi.mocked(useWindowSizeModule.useWindowSize).mockReturnValue({
      width: 0,
      height: 0,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true when width is below 768 (mobile)', () => {
    vi.mocked(useWindowSizeModule.useWindowSize).mockReturnValue({
      width: 767,
      height: 1024,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when width is exactly 768 (tablet/desktop boundary)', () => {
    vi.mocked(useWindowSizeModule.useWindowSize).mockReturnValue({
      width: 768,
      height: 1024,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns false when width is above 768 (desktop)', () => {
    vi.mocked(useWindowSizeModule.useWindowSize).mockReturnValue({
      width: 1200,
      height: 800,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('transitions from mobile to desktop when width crosses 768', () => {
    const mock = vi.mocked(useWindowSizeModule.useWindowSize);
    mock.mockReturnValue({ width: 500, height: 800 });
    const { result, rerender } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    mock.mockReturnValue({ width: 800, height: 800 });
    rerender();
    expect(result.current).toBe(false);
  });

  it('transitions from desktop to mobile when width drops below 768', () => {
    const mock = vi.mocked(useWindowSizeModule.useWindowSize);
    mock.mockReturnValue({ width: 1024, height: 768 });
    const { result, rerender } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    mock.mockReturnValue({ width: 400, height: 768 });
    rerender();
    expect(result.current).toBe(true);
  });
});
