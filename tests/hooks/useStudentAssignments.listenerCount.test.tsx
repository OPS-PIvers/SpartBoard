import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useStudentAssignments } from '@/hooks/useStudentAssignments';

/**
 * Guards the bounded per-status listener plan (optimization item F8 + its
 * code-review fix). A multi-value status filter (quiz's active channel =
 * `['waiting', 'active']`) fans out into one `onSnapshot` per status value so
 * each query can filter `status` SERVER-SIDE (`where('status','==',v)`). This
 * keeps Firestore reads bounded: the alternative — a single status-less query —
 * would stream the class's entire session history (incl. the unbounded pile of
 * `ended` sessions that accumulate over a term) and discard the non-matching
 * statuses in memory, a read-cost regression on a school-district budget.
 *
 * Listener counts for the current `KIND_CONFIG`:
 *   quiz            active 2 statuses×2 shapes + ended 1×2 shapes = 6
 *   video-activity  active 1×2 shapes + ended 1×2 shapes          = 4
 *   guided-learning active 1×2 shapes (no ended channel)          = 2
 *   mini-app        active 1×1 shape  + ended 1×1 shape           = 2
 *   activity-wall   active 1×1 shape  (no ended channel)          = 1
 *                                                           total = 15
 */

/**
 * This mock RESPECTS the `where('status','==',…)` constraint a query records,
 * so each per-status active listener (and the Ended channel's `== 'ended'`)
 * only receives docs matching its status — exactly the server-side bound the
 * fan-out relies on. `where` records its (field, op, value); `query` threads
 * the collected constraints + collection name onto the returned ref;
 * `onSnapshot` then applies any status equality before delivering docs.
 */
interface WhereConstraint {
  __where: { field: string; op: string; value: unknown };
}

vi.mock('firebase/firestore', async () => {
  const actual =
    await vi.importActual<typeof import('firebase/firestore')>(
      'firebase/firestore'
    );
  return {
    ...actual,
    collection: vi.fn((_db: unknown, name: string) => ({ __name: name })),
    query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({
      ...(ref as object),
      __constraints: constraints,
    })),
    where: vi.fn(
      (field: string, op: string, value: unknown): WhereConstraint => ({
        __where: { field, op, value },
      })
    ),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    onSnapshot: vi.fn(),
  };
});

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
}));

interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
}

interface QueryRef {
  __name?: string;
  __constraints?: unknown[];
}

interface FakeSnapshot {
  docs: { id: string; data: () => Record<string, unknown> }[];
}
type SnapshotCallback = (snap: FakeSnapshot) => void;

/** Pull the `status == value` from a query ref's recorded constraints, if any. */
function statusEqualityOf(ref: QueryRef): string | null {
  for (const c of ref.__constraints ?? []) {
    const w = (c as Partial<WhereConstraint>).__where;
    if (w && w.field === 'status' && w.op === '==') {
      return typeof w.value === 'string' ? w.value : null;
    }
  }
  return null;
}

/**
 * Deliver a fixed doc list per collection synchronously, honoring the
 * server-side `status == value` constraint on each query. Every active/ended
 * listener carries a single-value status `==`, so a doc only reaches the
 * listener whose status it matches.
 */
function deliverDocsByCollection(
  byCollection: Record<string, FakeDoc[]>
): void {
  const impl = (ref: unknown, onNext: SnapshotCallback): (() => void) => {
    const queryRef = ref as QueryRef;
    const name = queryRef.__name ?? '';
    const statusEq = statusEqualityOf(queryRef);
    const docs = (byCollection[name] ?? [])
      .filter((d) => statusEq === null || d.data.status === statusEq)
      .map((d) => ({
        id: d.id,
        data: () => d.data,
      }));
    onNext({ docs });
    return () => undefined;
  };
  vi.mocked(firestore.onSnapshot).mockImplementation(
    impl as unknown as typeof firestore.onSnapshot
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useStudentAssignments — bounded per-status listener plan (F8)', () => {
  it('opens one listener per (kind, channel, shape, status) — 15 for the current config', async () => {
    deliverDocsByCollection({});

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    // Quiz's active channel fans waiting+active into 2 server-side-filtered
    // listeners per shape, so the plan totals 15 (see the table above).
    expect(vi.mocked(firestore.onSnapshot)).toHaveBeenCalledTimes(15);
  });

  it('cleans up every listener on unmount', async () => {
    const unsubscribe = vi.fn();
    vi.mocked(firestore.onSnapshot).mockImplementation(((
      _ref: unknown,
      onNext: SnapshotCallback
    ) => {
      onNext({ docs: [] });
      return unsubscribe;
    }) as unknown as typeof firestore.onSnapshot);

    const { result, unmount } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    const opened = vi.mocked(firestore.onSnapshot).mock.calls.length;
    expect(opened).toBe(15);
    unmount();
    // Exactly one cleanup per opened listener — no leaks, no double-frees.
    expect(unsubscribe).toHaveBeenCalledTimes(opened);
  });

  it('surfaces both multi-value quiz active statuses via their per-status listeners', async () => {
    // Each active status has its own server-side `== status` query, so the
    // waiting and active quizzes are delivered by separate listeners and both
    // surface as active. The Ended channel's `status == 'ended'` matches
    // neither, so neither leaks into the ended bucket.
    deliverDocsByCollection({
      quiz_sessions: [
        {
          id: 'q-waiting',
          data: {
            quizTitle: 'Waiting Quiz',
            classIds: ['c1'],
            status: 'waiting',
            createdAt: 300,
          },
        },
        {
          id: 'q-active',
          data: {
            quizTitle: 'Active Quiz',
            classIds: ['c1'],
            status: 'active',
            createdAt: 200,
          },
        },
      ],
    });

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    const active = result.current.assignments.filter(
      (a) => a.kind === 'quiz' && a.channel === 'active'
    );
    const activeIds = active.map((a) => a.sessionId).sort();
    // Both multi-value active statuses surface through their own listeners.
    expect(activeIds).toEqual(['q-active', 'q-waiting']);
  });

  it('never reads a doc whose status no active/ended listener filters for', async () => {
    // An 'archived' quiz matches neither active listener (`== waiting` /
    // `== active`) nor the Ended channel (`== ended`), so the server-side
    // status filter keeps it out of every bucket — it is never even read.
    deliverDocsByCollection({
      quiz_sessions: [
        {
          id: 'q-active',
          data: {
            quizTitle: 'Active Quiz',
            classIds: ['c1'],
            status: 'active',
            createdAt: 200,
          },
        },
        {
          id: 'q-archived',
          data: {
            quizTitle: 'Archived Quiz',
            classIds: ['c1'],
            status: 'archived',
            createdAt: 50,
          },
        },
      ],
    });

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    const activeIds = result.current.assignments
      .filter((a) => a.kind === 'quiz' && a.channel === 'active')
      .map((a) => a.sessionId);
    expect(activeIds).toContain('q-active');
    // 'archived' matches no listener's status filter, so it appears nowhere.
    expect(activeIds).not.toContain('q-archived');
    const allIds = result.current.assignments.map((a) => a.sessionId);
    expect(allIds).not.toContain('q-archived');
  });
});
