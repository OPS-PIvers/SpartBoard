import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ db: {} }));

// Capture the onSnapshot callback so the test can push doc sets.
let onNext:
  | ((snap: { docs: { id: string; data: () => unknown }[] }) => void)
  | null = null;
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  onSnapshot: (
    _ref: unknown,
    next: (snap: { docs: { id: string; data: () => unknown }[] }) => void
  ) => {
    onNext = next;
    return () => {
      onNext = null;
    };
  },
}));

import { useSchoologySeenSections } from '@/hooks/useSchoologySeenSections';

beforeEach(() => {
  onNext = null;
});

describe('useSchoologySeenSections', () => {
  it('maps the inventory docs and drops entries with no sessionId', async () => {
    const { result } = renderHook(() => useSchoologySeenSections('teacher-1'));
    act(() => {
      onNext?.({
        docs: [
          {
            id: 'ctx-1',
            data: () => ({
              contextId: 'ctx-1',
              contextTitle: 'Algebra 1 · P1',
              sessionId: 'sess-1',
              kind: 'quiz',
            }),
          },
          {
            id: 'ctx-2',
            data: () => ({
              contextId: 'ctx-2',
              contextTitle: 'No session',
              sessionId: '', // not actionable → dropped
              kind: 'va',
            }),
          },
        ],
      });
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toEqual({
      contextId: 'ctx-1',
      contextTitle: 'Algebra 1 · P1',
      sessionId: 'sess-1',
      kind: 'quiz',
    });
  });

  it('returns [] and does not subscribe when signed out', () => {
    const { result } = renderHook(() => useSchoologySeenSections(null));
    expect(result.current).toEqual([]);
    expect(onNext).toBeNull();
  });
});
