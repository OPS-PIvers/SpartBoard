import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

type Listener = (snap: unknown) => void;
const listeners = new Map<string, Listener>();
const unsubscribed: string[] = [];

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  onSnapshot: (ref: { path: string }, next: Listener) => {
    listeners.set(ref.path, next);
    return () => {
      listeners.delete(ref.path);
      unsubscribed.push(ref.path);
    };
  },
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { useMyUpdateAcks, useUpdateAcksFor } from './usePlcUpdates';

const ackPath = (id: string) => `plcs/p/updates/${id}/acks`;
const listSnap = (uids: string[]) => ({
  docs: uids.map((uid) => ({
    id: uid,
    data: () => ({ uid, name: uid, ackedAt: 5 }),
  })),
});

beforeEach(() => {
  listeners.clear();
  unsubscribed.length = 0;
});

describe('useUpdateAcksFor (lead and co-lead roster)', () => {
  it('listens once per listed update and drops ids that leave the list', () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useUpdateAcksFor('p', ids, true),
      { initialProps: { ids: ['a', 'b'] } }
    );
    expect([...listeners.keys()].sort()).toEqual([ackPath('a'), ackPath('b')]);
    act(() => {
      listeners.get(ackPath('a'))?.(listSnap(['x']));
      listeners.get(ackPath('b'))?.(listSnap(['y', 'z']));
    });
    expect(Object.keys(result.current).sort()).toEqual(['a', 'b']);

    rerender({ ids: ['a'] });
    expect(unsubscribed).toContain(ackPath('b'));
    expect([...listeners.keys()]).toEqual([ackPath('a')]);
    expect(Object.keys(result.current)).toEqual(['a']);
  });

  it('opens nothing when disabled (members)', () => {
    const { result } = renderHook(() => useUpdateAcksFor('p', ['a'], false));
    expect(listeners.size).toBe(0);
    expect(result.current).toEqual({});
  });
});

describe('useMyUpdateAcks (member)', () => {
  it('watches only the member own ack doc and drops stale ids', () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useMyUpdateAcks('p', ids),
      { initialProps: { ids: ['a', 'b'] } }
    );
    expect([...listeners.keys()].sort()).toEqual([
      `${ackPath('a')}/me`,
      `${ackPath('b')}/me`,
    ]);
    act(() => {
      for (const id of ['a', 'b']) {
        listeners.get(`${ackPath(id)}/me`)?.({
          id: 'me',
          exists: () => true,
          data: () => ({ uid: 'me', ackedAt: 7 }),
        });
      }
    });
    expect(result.current).toEqual({ a: 7, b: 7 });
    rerender({ ids: ['b'] });
    expect(result.current).toEqual({ b: 7 });
  });

  it('opens nothing for a lead or co-lead (null plc id)', () => {
    renderHook(() => useMyUpdateAcks(null, ['a']));
    expect(listeners.size).toBe(0);
  });
});
