import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useStudentAssignments } from '@/hooks/useStudentAssignments';

/**
 * Guards the listener-count collapse (optimization item F8). Multi-value
 * status filters used to fan out into one `onSnapshot` per status value:
 * quiz's active channel = `['waiting', 'active']` opened TWO listeners per
 * shape, doubling its active-channel listener count. The hook now issues a
 * single status-less query per (kind, channel, shape) and intersects the
 * accepted statuses in-memory, so:
 *
 *   - the total number of `onSnapshot` subscriptions drops, and
 *   - the resulting assignment set is unchanged — `waiting` and `active`
 *     quizzes still surface, and an `ended` quiz returned by the (now
 *     status-less) active query is dropped by the in-memory filter.
 *
 * Listener counts for the current `KIND_CONFIG`:
 *   quiz            active 1×2 shapes + ended 1×2 shapes      = 4
 *   video-activity  active 1×2 shapes + ended 1×2 shapes      = 4
 *   guided-learning active 1×2 shapes (no ended channel)      = 2
 *   mini-app        active 1×1 shape  + ended 1×1 shape       = 2
 *   activity-wall   active 1×1 shape  (no ended channel)      = 1
 *                                                       total = 13
 *
 * Before the collapse, quiz's active fan-out added 2 extra listeners (15).
 */

/**
 * Unlike the view-only harness, this mock RESPECTS the `where('status','==',…)`
 * constraint. The collapse moves quiz's active status check from the server to
 * an in-memory intersection; to assert that intersection honestly we must stop
 * the Ended channel's server-side `status == 'ended'` from leaking active docs.
 * `where` records its (field, op, value); `query` threads the collected
 * constraints + collection name onto the returned ref; `onSnapshot` then
 * applies any status equality before delivering docs.
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
 * Deliver a fixed doc list per collection synchronously, honoring any
 * server-side `status == value` constraint on the query (so the Ended
 * channel's `== 'ended'` doesn't leak active-status docs into the ended
 * bucket). Multi-value status filters carry no status constraint and receive
 * every doc — exactly the condition under which the hook's in-memory status
 * filter must do its job.
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

describe('useStudentAssignments — listener-count collapse (F8)', () => {
  it('opens one listener per (kind, channel, shape) — 13 for the current config', async () => {
    deliverDocsByCollection({});

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    // The pre-collapse fan-out opened 15 (quiz active fanned waiting+active
    // into 2 listeners per shape). One listener per shape now caps it at 13.
    expect(vi.mocked(firestore.onSnapshot)).toHaveBeenCalledTimes(13);
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
    expect(opened).toBe(13);
    unmount();
    // Exactly one cleanup per opened listener — no leaks, no double-frees.
    expect(unsubscribe).toHaveBeenCalledTimes(opened);
  });

  it('preserves the multi-value quiz active set across the in-memory status filter', async () => {
    // The active channel is now status-less server-side and intersects
    // `{waiting, active}` in-memory. The Ended channel keeps its server-side
    // `status == 'ended'` (honored by this harness), so neither quiz below
    // reaches the ended bucket — both surface as `active`, proving the
    // single-listener collapse didn't drop either status.
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
    // Both multi-value active statuses survive the single-listener collapse.
    expect(activeIds).toEqual(['q-active', 'q-waiting']);
  });

  it('drops a doc whose status the multi-value active filter rejects', async () => {
    // A quiz with a status outside `{waiting, active}` must never be tagged as
    // an active assignment by the status-less active listener's in-memory
    // intersection. (The Ended channel has its own server-side `== 'ended'`
    // gate; we assert specifically that the *active* bucket excludes it.)
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
    // 'archived' is neither 'waiting' nor 'active' — the in-memory filter
    // drops it from the active bucket.
    expect(activeIds).not.toContain('q-archived');
    // And the Ended channel's `== 'ended'` rejects it too, so the archived
    // quiz appears in no bucket at all.
    const allIds = result.current.assignments.map((a) => a.sessionId);
    expect(allIds).not.toContain('q-archived');
  });
});
