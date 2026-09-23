import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

type SnapCb = (snap: { exists: () => boolean; data: () => unknown }) => void;
type ErrCb = (err: unknown) => void;
let emit: { next: SnapCb; error: ErrCb } | null = null;
let watched: string | null = null;
const unsubscribe = vi.fn();

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: (ref: { path: string }, next: SnapCb, error: ErrCb) => {
    watched = ref.path;
    emit = { next, error };
    return unsubscribe;
  },
}));

import { act } from 'react';
import { useSubLaunchAsTeacherSettings } from './useSubLaunchAsTeacherSettings';

const snap = (data: unknown) => ({
  exists: () => data !== null,
  data: () => data,
});

beforeEach(() => {
  emit = null;
  watched = null;
  vi.clearAllMocks();
});

describe('useSubLaunchAsTeacherSettings', () => {
  it('starts off, before the doc has been read', () => {
    const { result } = renderHook(() => useSubLaunchAsTeacherSettings());
    expect(result.current.enabled).toBe(false);
    expect(watched).toBe('admin_settings/sub_launch_as_teacher');
  });

  it('turns on when an admin has switched it on', () => {
    const { result } = renderHook(() => useSubLaunchAsTeacherSettings());
    act(() => emit?.next(snap({ enabled: true })));
    expect(result.current.enabled).toBe(true);
  });

  it('stays off for a doc that does not exist yet', () => {
    const { result } = renderHook(() => useSubLaunchAsTeacherSettings());
    act(() => emit?.next(snap(null)));
    expect(result.current.enabled).toBe(false);
  });

  // The callable checks the same switch, so hiding the button is the safe
  // failure: an unreadable doc costs a control, not correctness.
  it('falls back to off when the doc cannot be read', () => {
    const { result } = renderHook(() => useSubLaunchAsTeacherSettings());
    act(() => emit?.next(snap({ enabled: true })));
    expect(result.current.enabled).toBe(true);
    act(() => emit?.error(new Error('permission-denied')));
    expect(result.current.enabled).toBe(false);
  });

  it('reads nothing when the caller has no use for it', () => {
    renderHook(() => useSubLaunchAsTeacherSettings(false));
    expect(emit).toBeNull();
  });

  it('stops listening when the last reader goes away', () => {
    const { unmount } = renderHook(() => useSubLaunchAsTeacherSettings());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
