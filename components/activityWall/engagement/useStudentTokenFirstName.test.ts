import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { useStudentTokenFirstName } from './useStudentTokenFirstName';

const userWith = (uid: string, claims: Record<string, unknown> | Error) =>
  ({
    uid,
    getIdTokenResult: () =>
      claims instanceof Error
        ? Promise.reject(claims)
        : Promise.resolve({ claims }),
  }) as unknown as User;

describe('useStudentTokenFirstName', () => {
  it('returns the first name on a student token', async () => {
    const user = userWith('s1', { studentRole: true, firstName: 'Ada' });
    const { result } = renderHook(() => useStudentTokenFirstName(user));
    await waitFor(() => expect(result.current).toBe('Ada'));
  });

  it('returns undefined for a student token minted before the claim', async () => {
    const user = userWith('s2', { studentRole: true });
    const { result } = renderHook(() => useStudentTokenFirstName(user));
    await waitFor(() => expect(result.current).toBeUndefined());
  });

  it('ignores the claim on a non-student token', async () => {
    const user = userWith('t1', { firstName: 'Ada' });
    const { result } = renderHook(() => useStudentTokenFirstName(user));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when the token cannot be read or there is no user', async () => {
    const failing = userWith('s3', new Error('offline'));
    const { result } = renderHook(() => useStudentTokenFirstName(failing));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeUndefined();
    const none = renderHook(() => useStudentTokenFirstName(null));
    expect(none.result.current).toBeUndefined();
  });
});
