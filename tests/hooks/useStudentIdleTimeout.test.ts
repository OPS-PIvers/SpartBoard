import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Mocks --------------------------------------------------------------
// The hook signs the student out via firebase/auth + config/firebase and
// clears the cached first name before redirecting. None of those side
// effects should touch a real Firebase instance in the unit test.
const signOutMock = vi.fn().mockResolvedValue(undefined);
const clearStudentFirstNameMock = vi.fn();

vi.mock('firebase/auth', () => ({
  signOut: (...args: unknown[]): Promise<void> =>
    signOutMock(...args) as Promise<void>,
}));
vi.mock('@/config/firebase', () => ({
  auth: { __mockAuth: true },
}));
vi.mock('@/context/StudentAuthContextValue', () => ({
  clearStudentFirstName: (): void => {
    clearStudentFirstNameMock();
  },
}));

import {
  useStudentIdleTimeout,
  STUDENT_IDLE_TIMEOUT_MS,
  STUDENT_LOGIN_PATH,
} from '@/hooks/useStudentIdleTimeout';

// Stub the read-only window.location so `.assign()` is observable and
// jsdom's "navigation not implemented" is never hit.
let assignMock: ReturnType<typeof vi.fn>;
function installLocation(): void {
  assignMock = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, pathname: '/quiz', assign: assignMock },
  });
}

describe('useStudentIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signOutMock.mockClear();
    clearStudentFirstNameMock.mockClear();
    installLocation();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('signs out and redirects after the 15-minute idle window', () => {
    renderHook(() => useStudentIdleTimeout(true));

    // Just short of the window — nothing has fired yet.
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS - 1);
    });
    expect(signOutMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(clearStudentFirstNameMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith(STUDENT_LOGIN_PATH);
  });

  it('clears the first name BEFORE redirecting (session hygiene)', () => {
    renderHook(() => useStudentIdleTimeout(true));
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS);
    });
    // Ordering matters — a stale greeting must be wiped before nav.
    const clearOrder = clearStudentFirstNameMock.mock.invocationCallOrder[0];
    const assignOrder = assignMock.mock.invocationCallOrder[0];
    expect(clearOrder).toBeLessThan(assignOrder);
  });

  it('resets the countdown on user interaction', () => {
    renderHook(() => useStudentIdleTimeout(true));

    // Advance most of the window, then interact — resetting the timer.
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS - 1000);
      window.dispatchEvent(new Event('keydown'));
    });
    // The original deadline passes, but the reset pushed it out.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(signOutMock).not.toHaveBeenCalled();

    // A full fresh window from the interaction does trigger sign-out.
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS);
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('throttles interaction resets to once per 5 seconds', () => {
    renderHook(() => useStudentIdleTimeout(true));

    // First interaction resets at t=0 (throttle already satisfied since
    // lastInteractionAt seeds at mount time... fire well after mount).
    act(() => {
      vi.advanceTimersByTime(6000);
      window.dispatchEvent(new Event('mousemove')); // resets, deadline now +15m
    });

    // A second interaction 2s later is inside the 5s throttle — ignored,
    // so the deadline stays anchored to the previous reset.
    act(() => {
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new Event('mousemove'));
    });

    // From the FIRST (honored) reset, 15m elapses → sign-out. The throttled
    // second event did not push the deadline further out.
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS - 2000);
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('does not arm any timer when disabled', () => {
    renderHook(() => useStudentIdleTimeout(false));
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS * 2);
      window.dispatchEvent(new Event('click'));
    });
    expect(signOutMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('tears down timer and listeners on unmount', () => {
    const { unmount } = renderHook(() => useStudentIdleTimeout(true));
    unmount();
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS * 2);
      window.dispatchEvent(new Event('keydown'));
    });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('redirects to a custom path when provided', () => {
    renderHook(() => useStudentIdleTimeout(true, '/join'));
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS);
    });
    expect(assignMock).toHaveBeenCalledWith('/join');
  });

  it('swallows a rejected firebase signOut without breaking the redirect', async () => {
    signOutMock.mockRejectedValueOnce(new Error('network'));
    renderHook(() => useStudentIdleTimeout(true));
    act(() => {
      vi.advanceTimersByTime(STUDENT_IDLE_TIMEOUT_MS);
    });
    // The redirect is the real remediation and must happen regardless.
    expect(assignMock).toHaveBeenCalledWith(STUDENT_LOGIN_PATH);
    // Flush the rejected promise's .catch so it doesn't leak.
    await Promise.resolve();
  });
});
