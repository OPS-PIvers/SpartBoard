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

describe('useRemoteControlSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emit = null;
    mockedUseAuth.mockReturnValue({
      user: { uid: 'u1' },
      remoteControlEnabled: true,
    });
    (firestore.doc as unknown as Fn).mockReturnValue({});
    (firestore.onSnapshot as unknown as Fn).mockImplementation(
      (_ref: unknown, next: (snap: { data: () => unknown }) => void) => {
        emit = next;
        return () => {
          emit = null;
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

  it('does not subscribe without a signed-in user', () => {
    mockedUseAuth.mockReturnValue({ user: null, remoteControlEnabled: true });
    renderHook(() => useRemoteControlSetting());
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
  });
});
