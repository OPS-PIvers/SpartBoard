import { describe, it, expect, vi, beforeEach } from 'vitest';

const call = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => call,
}));
vi.mock('@/config/firebase', () => ({ functions: {} }));

import { refreshVerifiedClassesIfStale } from './verifiedClassesRefresh';

const T = 1_800_000_000_000;

describe('refreshVerifiedClassesIfStale', () => {
  beforeEach(() => {
    call.mockReset();
    localStorage.clear();
  });

  it('refreshes once, then waits about a day', async () => {
    call.mockResolvedValue({ data: { count: 2, classlinkAt: 1 } });
    await refreshVerifiedClassesIfStale('u', T);
    await refreshVerifiedClassesIfStale('u', T + 1);
    expect(call).toHaveBeenCalledTimes(1);
    await refreshVerifiedClassesIfStale('u', T + 21 * 60 * 60 * 1000);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('tries again next load when ClassLink has never answered or the call fails', async () => {
    call.mockResolvedValueOnce({ data: { count: 0, classlinkAt: null } });
    await refreshVerifiedClassesIfStale('u', T);
    call.mockRejectedValueOnce(new Error('offline'));
    await refreshVerifiedClassesIfStale('u', T + 1);
    call.mockResolvedValueOnce({ data: { count: 1, classlinkAt: 5 } });
    await refreshVerifiedClassesIfStale('u', T + 2);
    await refreshVerifiedClassesIfStale('u', T + 3);
    expect(call).toHaveBeenCalledTimes(3);
  });
});
