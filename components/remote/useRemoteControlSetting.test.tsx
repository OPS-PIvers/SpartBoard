import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';
import { useRemoteControlSetting } from './useRemoteControlSetting';
import { useAuth } from '@/context/useAuth';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;

const mockedUseAuth = useAuth as unknown as Fn;

let emit: ((snap: { data: () => unknown }) => void) | null = null;
let fail: ((err: unknown) => void) | null = null;

describe('useRemoteControlSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emit = null;
    fail = null;
    mockedUseAuth.mockReturnValue({
      user: { uid: 'u1' },
      remoteControlEnabled: true,
    });
    (firestore.doc as unknown as Fn).mockReturnValue({});
    (firestore.onSnapshot as unknown as Fn).mockImplementation(
      (
        _ref: unknown,
        next: (snap: { data: () => unknown }) => void,
        onError: (err: unknown) => void
      ) => {
        emit = next;
        fail = onError;
        return () => {
          emit = null;
          fail = null;
        };
      }
    );
  });

  it('falls back to the auth value until the profile doc arrives', () => {
    mockedUseAuth.mockReturnValue({
      user: { uid: 'u1' },
      remoteControlEnabled: false,
    });
    const { result } = renderHook(() => useRemoteControlSetting());
    expect(result.current).toBe(false);
  });

  it('turns the remote off when the profile doc flips mid-session', () => {
    const { result } = renderHook(() => useRemoteControlSetting());
    expect(result.current).toBe(true);

    act(() => emit?.({ data: () => ({ remoteControlEnabled: false }) }));
    expect(result.current).toBe(false);

    act(() => emit?.({ data: () => ({ remoteControlEnabled: true }) }));
    expect(result.current).toBe(true);
  });

  it('treats a profile doc with no toggle as enabled', () => {
    const { result } = renderHook(() => useRemoteControlSetting());
    act(() => emit?.({ data: () => ({}) }));
    expect(result.current).toBe(true);
  });

  it('keeps the last received value when the listener errors', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    // remoteControlEnabled is true at sign-in, so reverting to it on error
    // would re-enable a remote the teacher had just switched off.
    const { result } = renderHook(() => useRemoteControlSetting());
    act(() => emit?.({ data: () => ({ remoteControlEnabled: false }) }));
    expect(result.current).toBe(false);

    act(() => fail?.(new Error('permission-denied')));
    expect(result.current).toBe(false);
    errorSpy.mockRestore();
  });

  it('does not subscribe without a signed-in user', () => {
    mockedUseAuth.mockReturnValue({ user: null, remoteControlEnabled: true });
    renderHook(() => useRemoteControlSetting());
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
  });
});
