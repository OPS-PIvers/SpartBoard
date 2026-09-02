import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useStudentClassDirectory } from './useStudentClassDirectory';
import { httpsCallable } from 'firebase/functions';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  functions: {},
  isAuthBypass: false,
}));

describe('useStudentClassDirectory', () => {
  const mockHttpsCallable = httpsCallable as Mock;
  let callCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
    mockHttpsCallable.mockImplementation(() =>
      vi.fn().mockImplementation(() => {
        callCount += 1;
        return Promise.resolve({
          data: {
            classes: [
              { classId: 'c1', name: 'Class', teacherDisplayName: 'T' },
            ],
          },
        });
      })
    );
  });

  it('does not refetch a cache hit for an unrelated key after a retry elsewhere', async () => {
    // Unique uid per test — `directoryCache` is module-scoped and persists
    // across tests in this file, so a shared uid would leak cache entries.
    const uid = 'student-unrelated-retry';
    const { result, rerender } = renderHook(
      ({ classIds }: { classIds: readonly string[] }) =>
        useStudentClassDirectory({ classIds, pseudonymUid: uid }),
      { initialProps: { classIds: ['classA'] } }
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(callCount).toBe(1);

    // Retry classA — bumps retryNonce for the whole hook instance.
    act(() => result.current.retry());
    await waitFor(() => expect(callCount).toBe(2));

    // Switch to classB (miss) then back to classA (should now be a cache hit).
    rerender({ classIds: ['classB'] });
    await waitFor(() => expect(callCount).toBe(3));

    rerender({ classIds: ['classA'] });
    // classA is still in directoryCache from the retry fetch above, so this
    // should be an instant cache hit with no additional network call.
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(callCount).toBe(3);
  });

  it('still refetches when the same key is retried again', async () => {
    const uid = 'student-same-key-retry';
    const { result } = renderHook(() =>
      useStudentClassDirectory({ classIds: ['classA'], pseudonymUid: uid })
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(callCount).toBe(1);

    act(() => result.current.retry());
    await waitFor(() => expect(callCount).toBe(2));
  });
});
