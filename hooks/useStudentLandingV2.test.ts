import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A plain function, not vi.fn(): Vitest's result tracking reports a rejected mock promise as unhandled.
const call = vi.hoisted(() => ({
  impl: (): Promise<unknown> => Promise.resolve({ data: {} }),
  count: 0,
}));
vi.mock('@/config/firebase', () => ({ functions: {}, isAuthBypass: false }));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => {
    call.count += 1;
    return call.impl();
  },
}));

import { useStudentLandingV2Enabled } from './useStudentLandingV2';

describe('useStudentLandingV2Enabled', () => {
  beforeEach(() => {
    call.count = 0;
  });

  it('is null while loading, then follows the server answer', async () => {
    call.impl = () => Promise.resolve({ data: { enabled: true } });
    const { result } = renderHook(() => useStudentLandingV2Enabled('uid-a'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is off when the call fails', async () => {
    call.impl = () => Promise.reject(new Error('nope'));
    const { result } = renderHook(() => useStudentLandingV2Enabled('uid-b'));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('is off without a signed-in student', () => {
    const { result } = renderHook(() => useStudentLandingV2Enabled(null));
    expect(result.current).toBe(false);
    expect(call.count).toBe(0);
  });
});
