import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Next = (snap: { docs: unknown[] }) => void;
const listeners: Record<string, { next: Next; error: (e: unknown) => void }> =
  {};
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  doc: () => ({}),
  onSnapshot: (ref: string, next: Next, error: (e: unknown) => void) => {
    listeners[ref] = { next, error };
    return () => undefined;
  },
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { act } from '@testing-library/react';
import { useWritingAllDrafts } from './useWritingResults';

const path = (uid: string) =>
  `writing_assignment_sessions/S1/responses/${uid}/drafts`;

describe('useWritingAllDrafts', () => {
  beforeEach(() => {
    for (const k of Object.keys(listeners)) delete listeners[k];
  });

  it('stops loading when one student copy listener errors', () => {
    const { result } = renderHook(() => useWritingAllDrafts('S1', ['a', 'b']));
    act(() => {
      listeners[path('a')].next({ docs: [] });
      listeners[path('b')].error(new Error('permission-denied'));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.byStudent.get('b')).toEqual([]);
  });
});
