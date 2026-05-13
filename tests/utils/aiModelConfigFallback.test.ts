import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetAiModelConfigFallbackForTests,
  reportAiModelConfigFallback,
  resetAiModelConfigFallbackLatch,
  setAiModelConfigFallbackHandler,
} from '@/utils/aiModelConfigFallback';

afterEach(() => {
  __resetAiModelConfigFallbackForTests();
});

describe('aiModelConfigFallback', () => {
  it('fires the handler once per latch lifetime and de-dupes subsequent reports', () => {
    const handler = vi.fn();
    setAiModelConfigFallbackHandler(handler);

    expect(reportAiModelConfigFallback(true)).toBe(true);
    expect(reportAiModelConfigFallback(true)).toBe(false);
    expect(reportAiModelConfigFallback(true)).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the usedFallback flag is falsy', () => {
    const handler = vi.fn();
    setAiModelConfigFallbackHandler(handler);

    reportAiModelConfigFallback(false);
    reportAiModelConfigFallback(undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('re-arms after resetAiModelConfigFallbackLatch is called', () => {
    // Guards the DashboardProvider unmount-cleanup contract: a re-mounted
    // provider (e.g. account switch without page reload) must surface the
    // toast again on the next stale-config attempt.
    const handler = vi.fn();
    setAiModelConfigFallbackHandler(handler);

    reportAiModelConfigFallback(true);
    expect(handler).toHaveBeenCalledTimes(1);

    resetAiModelConfigFallbackLatch();

    reportAiModelConfigFallback(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does not fire when no handler is registered', () => {
    setAiModelConfigFallbackHandler(null);
    expect(reportAiModelConfigFallback(true)).toBe(false);
  });
});
