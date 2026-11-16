import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { STUDENT_FIRST_NAME_KEY } from '@/context/StudentAuthContextValue';

const mockAuth = vi.hoisted(() => ({
  currentUser: null as null | {
    uid: string;
    displayName: string | null;
    isAnonymous?: boolean;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  },
}));
vi.mock('@/config/firebase', () => ({ auth: mockAuth }));

import { useWatermarkStudentName } from './useWatermarkStudentName';

const student = (claims: Record<string, unknown>, displayName = null) => ({
  uid: 'pseudo-1',
  displayName,
  getIdTokenResult: () => Promise.resolve({ claims }),
});

describe('useWatermarkStudentName', () => {
  beforeEach(() => {
    mockAuth.currentUser = null;
    window.sessionStorage.clear();
  });

  it('shows a signed-in student their first name from the token', async () => {
    mockAuth.currentUser = student({ studentRole: true, firstName: 'Maya' });
    const { result } = renderHook(() => useWatermarkStudentName());
    await waitFor(() => expect(result.current).toBe('Maya'));
  });

  it('uses the first name saved at sign-in when the token has none', async () => {
    window.sessionStorage.setItem(STUDENT_FIRST_NAME_KEY, ' Leo ');
    mockAuth.currentUser = student({ studentRole: true });
    const { result } = renderHook(() => useWatermarkStudentName());
    await waitFor(() => expect(result.current).toBe('Leo'));
  });

  it('never shows a stored first name to an anonymous PIN joiner', async () => {
    window.sessionStorage.setItem(STUDENT_FIRST_NAME_KEY, 'Leo');
    mockAuth.currentUser = { ...student({}), isAnonymous: true };
    const { result } = renderHook(() =>
      useWatermarkStudentName(undefined, '1234')
    );
    await waitFor(() => expect(result.current).toBe('PIN 1234'));
  });

  it('ignores a firstName claim on a non-student token', async () => {
    mockAuth.currentUser = student({ firstName: 'Maya' });
    const { result } = renderHook(() => useWatermarkStudentName());
    await waitFor(() => expect(result.current).toBe('Student'));
  });

  it('prefers an override, then falls back to PIN and Student', () => {
    expect(
      renderHook(() => useWatermarkStudentName(' Ada L ', '1234')).result
        .current
    ).toBe('Ada L');
    expect(
      renderHook(() => useWatermarkStudentName(undefined, '1234')).result
        .current
    ).toBe('PIN 1234');
    expect(renderHook(() => useWatermarkStudentName()).result.current).toBe(
      'Student'
    );
  });
});
