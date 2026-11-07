import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  on: true,
  loading: false,
  progress: { finished: {} },
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessFeature: () => h.on,
  }),
}));
vi.mock('@/hooks/useGettingStarted', () => ({
  useGettingStartedProgress: () => ({
    progress: h.progress,
    loading: h.loading,
  }),
}));

const { useFirstRun } = await import('./useFirstRun');
const { QUIET_START_MS } = await import('@/utils/gettingStartedProgress');

beforeEach(() => {
  h.on = true;
  h.loading = false;
  h.progress = { finished: {} };
});

describe('useFirstRun', () => {
  it('shows a pending welcome in the first week and holds quiet start', () => {
    h.progress = {
      finished: {},
      welcome: 'pending',
      firstSignInAt: Date.now() - 1000,
    };
    expect(renderHook(() => useFirstRun()).result.current).toEqual({
      welcomePending: true,
      quiet: true,
      firstRun: true,
    });
  });

  it('drops a welcome left pending past the first week', () => {
    h.progress = {
      finished: {},
      welcome: 'pending',
      firstSignInAt: Date.now() - QUIET_START_MS - 1000,
    };
    const { welcomePending, quiet } = renderHook(() => useFirstRun()).result
      .current;
    expect(welcomePending).toBe(false);
    expect(quiet).toBe(false);
  });

  it('is all off without the flag, and holds alerts while the doc loads', () => {
    h.on = false;
    h.progress = {
      finished: {},
      welcome: 'pending',
      firstSignInAt: Date.now(),
    };
    expect(renderHook(() => useFirstRun()).result.current).toEqual({
      welcomePending: false,
      quiet: false,
      firstRun: false,
    });
    h.on = true;
    h.loading = true;
    expect(renderHook(() => useFirstRun()).result.current.quiet).toBe(true);
  });
});
