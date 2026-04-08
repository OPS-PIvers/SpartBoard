import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useIsMobile } from '@/hooks/useIsMobile';
import * as useWindowSizeModule from '@/hooks/useWindowSize';

vi.mock('@/hooks/useWindowSize', () => ({
  useWindowSize: vi.fn(),
}));

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false initially if width is 0', () => {
    vi.mocked(useWindowSizeModule.useWindowSize).mockReturnValue({
      width: 0,
      height: 0,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true if width is greater than 0 and less than 768', () => {
    vi.mocked(useWindowSizeModule.useWindowSize).mockReturnValue({
      width: 767,
      height: 1000,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false if width is exactly 768', () => {
    vi.mocked(useWindowSizeModule.useWindowSize).mockReturnValue({
      width: 768,
      height: 1000,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns false if width is greater than 768', () => {
    vi.mocked(useWindowSizeModule.useWindowSize).mockReturnValue({
      width: 1024,
      height: 1000,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
