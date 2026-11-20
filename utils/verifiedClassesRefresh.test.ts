import { describe, it, expect, vi, beforeEach } from 'vitest';

const call = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => call,
}));
vi.mock('@/config/firebase', () => ({ functions: {} }));

import {
  CLASS_NOT_TAUGHT_MESSAGE,
  refreshVerifiedClassesIfStale,
  withVerifiedClassesRetry,
} from './verifiedClassesRefresh';

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

  it('retries in about an hour when ClassLink has not answered, and next load after a failure', async () => {
    call.mockResolvedValueOnce({ data: { count: 0, classlinkAt: null } });
    await refreshVerifiedClassesIfStale('u', T);
    await refreshVerifiedClassesIfStale('u', T + 1);
    expect(call).toHaveBeenCalledTimes(1);
    call.mockRejectedValueOnce(new Error('offline'));
    await refreshVerifiedClassesIfStale('u', T + 61 * 60 * 1000);
    call.mockResolvedValueOnce({ data: { count: 1, classlinkAt: 5 } });
    await refreshVerifiedClassesIfStale('u', T + 62 * 60 * 1000);
    await refreshVerifiedClassesIfStale('u', T + 63 * 60 * 1000);
    expect(call).toHaveBeenCalledTimes(3);
  });
});

describe('withVerifiedClassesRetry', () => {
  const denied = Object.assign(new Error('denied'), {
    code: 'permission-denied',
  });

  beforeEach(() => {
    call.mockReset();
    localStorage.clear();
  });

  it('refreshes the list once and retries a refused class-targeted write', async () => {
    call.mockResolvedValue({ data: { count: 2, classlinkAt: 1 } });
    // A refresh stamped moments ago must not stop the forced one.
    await refreshVerifiedClassesIfStale('u', T);
    const write = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(denied)
      .mockResolvedValueOnce('ok');
    await expect(
      withVerifiedClassesRetry('u', true, write, T + 1)
    ).resolves.toBe('ok');
    expect(write).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('explains a second refusal', async () => {
    call.mockResolvedValue({ data: { count: 0, classlinkAt: 1 } });
    const write = vi.fn<() => Promise<void>>().mockRejectedValue(denied);
    await expect(withVerifiedClassesRetry('u', true, write, T)).rejects.toThrow(
      CLASS_NOT_TAUGHT_MESSAGE
    );
  });

  it('passes other failures and untargeted writes straight through', async () => {
    const offline = Object.assign(new Error('offline'), {
      code: 'unavailable',
    });
    await expect(
      withVerifiedClassesRetry('u', true, () => Promise.reject(offline), T)
    ).rejects.toBe(offline);
    await expect(
      withVerifiedClassesRetry('u', false, () => Promise.reject(denied), T)
    ).rejects.toBe(denied);
    expect(call).not.toHaveBeenCalled();
  });
});
