import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  resetTeamLayout,
  saveTeamLayout,
  useTeamTypeDefaults,
} from './useTeamLayout';

type SnapshotCb = (snap: {
  exists: () => boolean;
  data: () => unknown;
}) => void;
type ErrorCb = (err: Error) => void;

const { listeners, onSnapshot, unsubscribe, updateDoc } = vi.hoisted(() => {
  const listeners: { next: SnapshotCb; error: ErrorCb }[] = [];
  const unsubscribe = vi.fn();
  return {
    listeners,
    unsubscribe,
    updateDoc: vi.fn(() => Promise.resolve()),
    onSnapshot: vi.fn((_ref: unknown, next: SnapshotCb, error: ErrorCb) => {
      listeners.push({ next, error });
      return unsubscribe;
    }),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  })),
  onSnapshot,
  updateDoc,
  deleteField: vi.fn(() => '__delete__'),
  serverTimestamp: vi.fn(() => '__ts__'),
}));
vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));

beforeEach(() => {
  listeners.length = 0;
  onSnapshot.mockClear();
  unsubscribe.mockClear();
  updateDoc.mockClear();
});

describe('useTeamTypeDefaults', () => {
  it('is null while loading and listens to the admin settings doc', () => {
    const { result } = renderHook(() => useTeamTypeDefaults());
    expect(result.current).toBeNull();
    expect(onSnapshot.mock.calls[0][0]).toEqual({
      path: 'admin_settings/team_type_defaults',
    });
  });

  it('returns empty defaults when the doc is absent', () => {
    const { result } = renderHook(() => useTeamTypeDefaults());
    act(() => {
      listeners[0].next({ exists: () => false, data: () => undefined });
    });
    expect(result.current).toEqual({ types: {} });
  });

  it('normalizes a saved doc', () => {
    const { result } = renderHook(() => useTeamTypeDefaults());
    act(() => {
      listeners[0].next({
        exists: () => true,
        data: () => ({
          types: { building: { heroRule: 'nextMeetingNote' }, nope: {} },
        }),
      });
    });
    expect(Object.keys(result.current?.types ?? {})).toEqual(['building']);
    expect(result.current?.types.building?.heroRule).toBe('nextMeetingNote');
  });

  it('falls back to empty defaults when the read fails', () => {
    const { result } = renderHook(() => useTeamTypeDefaults());
    act(() => {
      listeners[0].error(new Error('permission-denied'));
    });
    expect(result.current).toEqual({ types: {} });
  });

  it('unsubscribes on unmount and never subscribes when disabled', () => {
    const { unmount } = renderHook(() => useTeamTypeDefaults());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    onSnapshot.mockClear();
    const { result } = renderHook(() => useTeamTypeDefaults(false));
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});

describe('saveTeamLayout / resetTeamLayout', () => {
  it('writes only layout and updatedAt', async () => {
    await saveTeamLayout('p1', {
      pages: [{ id: 'hub', enabled: true }],
      landing: 'hub',
      cards: ['hero'],
      hero: { mode: 'default', ref: { kind: 'calendar' } },
    });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'plcs/p1' },
      {
        layout: {
          pages: [{ id: 'hub', enabled: true }],
          landing: 'hub',
          cards: ['hero'],
          hero: { mode: 'default' },
        },
        updatedAt: '__ts__',
      }
    );
  });

  it('reset deletes the layout field', async () => {
    await resetTeamLayout('p1');
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'plcs/p1' },
      { layout: '__delete__', updatedAt: '__ts__' }
    );
  });
});
