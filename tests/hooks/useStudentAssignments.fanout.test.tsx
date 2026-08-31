import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useStudentAssignments } from '@/hooks/useStudentAssignments';

/**
 * Fan-out channel tests (M17 spec §5 C1). Covers the merge contract for
 * `/student_assignments/{uid}/items`: dedupe by shared assignment/session
 * UUID, pointer-wins for window/override fields, session-wins for
 * title/status/content, late-arriving `individualTargeting` flags removing
 * an already-rendered class-channel row, direct-`getDoc` hydration for a
 * pointer whose session isn't in any class-channel bucket, dropping a
 * pointer whose session doc is missing, and byte-for-byte legacy output
 * when no pointer docs / individualTargeting flags exist.
 */

vi.mock('firebase/firestore', async () => {
  const actual =
    await vi.importActual<typeof import('firebase/firestore')>(
      'firebase/firestore'
    );
  return {
    ...actual,
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
      __name: segments.join('/'),
    })),
    query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({
      ...(ref as object),
      __constraints: constraints,
    })),
    where: vi.fn((field: string, op: string, value: unknown) => ({
      __where: { field, op, value },
    })),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    onSnapshot: vi.fn(),
    doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({
      __docPath: `${collectionName}/${id}`,
    })),
    getDoc: vi.fn(),
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

interface WhereConstraint {
  __where: { field: string; op: string; value: unknown };
}

function statusEqualityOf(ref: QueryRef): string | null {
  for (const c of ref.__constraints ?? []) {
    const w = (c as Partial<WhereConstraint>).__where;
    if (w && w.field === 'status' && w.op === '==') {
      return typeof w.value === 'string' ? w.value : null;
    }
  }
  return null;
}

/** Minimal onSnapshot rig: tracks registrations per collection name so tests
 * can push doc-list updates (`setDocs`) and have every matching listener
 * re-deliver, honoring the server-side `status == value` constraint. */
function makeSnapshotRig() {
  const docsByCollection: Record<string, FakeDoc[]> = {};
  const registrations: {
    name: string;
    statusEq: string | null;
    onNext: SnapshotCallback;
  }[] = [];

  const deliverTo = (reg: (typeof registrations)[number]) => {
    const docs = (docsByCollection[reg.name] ?? [])
      .filter((d) => reg.statusEq === null || d.data.status === reg.statusEq)
      .map((d) => ({ id: d.id, data: () => d.data }));
    reg.onNext({ docs });
  };

  vi.mocked(firestore.onSnapshot).mockImplementation(((
    ref: unknown,
    onNext: SnapshotCallback
  ) => {
    const queryRef = ref as QueryRef;
    const reg = {
      name: queryRef.__name ?? '',
      statusEq: statusEqualityOf(queryRef),
      onNext,
    };
    registrations.push(reg);
    deliverTo(reg);
    return () => {
      const idx = registrations.indexOf(reg);
      if (idx >= 0) registrations.splice(idx, 1);
    };
  }) as unknown as typeof firestore.onSnapshot);

  return {
    setDocs(name: string, docs: FakeDoc[]) {
      docsByCollection[name] = docs;
      for (const reg of registrations) {
        if (reg.name === name) deliverTo(reg);
      }
    },
  };
}

/** getDoc rig for the direct-hydration path: docs keyed by `collection/id`. */
function makeGetDocRig() {
  const byPath: Record<string, FakeDoc | undefined> = {};
  vi.mocked(firestore.getDoc).mockImplementation(((ref: unknown) => {
    const path = (ref as { __docPath?: string }).__docPath ?? '';
    const entry = byPath[path];
    return Promise.resolve({
      exists: () => entry !== undefined,
      data: () => entry?.data,
    });
  }) as unknown as typeof firestore.getDoc);
  return {
    setDoc(path: string, data: Record<string, unknown>) {
      byPath[path] = { id: path, data };
    },
  };
}

/**
 * getDoc rig that REJECTS the first N calls for a given path, then resolves
 * with the given data — for the F1 transient-fetch-error regression test.
 */
function makeFlakyGetDocRig() {
  const byPath: Record<string, FakeDoc | undefined> = {};
  const rejectRemaining: Record<string, number> = {};
  vi.mocked(firestore.getDoc).mockImplementation(((ref: unknown) => {
    const path = (ref as { __docPath?: string }).__docPath ?? '';
    if ((rejectRemaining[path] ?? 0) > 0) {
      rejectRemaining[path] -= 1;
      return Promise.reject(new Error('transient fetch failure'));
    }
    const entry = byPath[path];
    return Promise.resolve({
      exists: () => entry !== undefined,
      data: () => entry?.data,
    });
  }) as unknown as typeof firestore.getDoc);
  return {
    setDoc(path: string, data: Record<string, unknown>) {
      byPath[path] = { id: path, data };
    },
    rejectNextNCalls(path: string, n: number) {
      rejectRemaining[path] = n;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useStudentAssignments — fan-out channel (M17 C1)', () => {
  // F2: MyAssignmentsPage ALWAYS passes studentUid in production — a test
  // that only exercises the studentUid-omitted path proves nothing about
  // what ships. These assert the REAL wiring: studentUid present, zero
  // pointer docs, no individualTargeting flags anywhere.
  it('real wiring: studentUid present + zero pointers + no individualTargeting matches the legacy hook output byte-for-byte', async () => {
    const rig = makeSnapshotRig();
    makeGetDocRig();
    rig.setDocs('quiz_sessions', [
      {
        id: 'q1',
        data: {
          quizTitle: 'Plain Quiz',
          classIds: ['c1'],
          status: 'active',
          createdAt: 100,
        },
      },
    ]);
    // No student_assignments/student-a/items docs registered — the pointer
    // listener delivers an empty snapshot, exercising the real production
    // shape (studentUid always supplied) rather than the omitted path.

    const legacy = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );
    const real = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(legacy.result.current.loadState).toBe('ready');
      expect(real.result.current.loadState).toBe('ready');
    });

    expect(real.result.current.assignments).toEqual(
      legacy.result.current.assignments
    );
    expect(real.result.current.hasErrors).toBe(false);
    expect(real.result.current.hasClassErrors).toBe(false);
  });

  it('real wiring: loading state does not wait on the pointer channel beyond its own resolution', async () => {
    // The pointer rig here delivers synchronously just like the class-channel
    // rig, so `loadState` should reach 'ready' in the same tick as the
    // studentUid-omitted hook — the pointer channel must not introduce an
    // extra render pass or artificial delay before the page can render.
    const rig = makeSnapshotRig();
    makeGetDocRig();
    rig.setDocs('quiz_sessions', [
      {
        id: 'q1',
        data: {
          quizTitle: 'Plain Quiz',
          classIds: ['c1'],
          status: 'active',
          createdAt: 100,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    // Both the class-channel plan and the pointer listener deliver
    // synchronously in this rig, so readiness is reachable without any
    // additional real-timer waits beyond the microtask flush waitFor uses.
    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });
    expect(result.current.assignments.map((a) => a.sessionId)).toEqual(['q1']);
  });

  it('real wiring: opens exactly one additional listener for the pointer channel (16 total for the current KIND_CONFIG + studentUid)', async () => {
    const rig = makeSnapshotRig();
    makeGetDocRig();
    rig.setDocs('quiz_sessions', []);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    // 15 class-channel listeners (see useStudentAssignments.listenerCount.test.tsx)
    // + 1 pointer-channel listener on /student_assignments/{uid}/items.
    expect(vi.mocked(firestore.onSnapshot)).toHaveBeenCalledTimes(16);
  });

  it('dedupes by the shared assignment UUID, pointer wins window/override, session wins title', async () => {
    const rig = makeSnapshotRig();
    makeGetDocRig();
    rig.setDocs('quiz_sessions', [
      {
        id: 'q-targeted',
        data: {
          quizTitle: 'Targeted Quiz',
          classIds: ['c1'],
          status: 'active',
          createdAt: 100,
          individualTargeting: true,
          openAt: 1000,
          closeAt: 2000,
        },
      },
    ]);
    rig.setDocs('student_assignments/student-a/items', [
      {
        id: 'q-targeted',
        data: {
          kind: 'quiz',
          sessionId: 'q-targeted',
          teacherUid: 't1',
          classId: 'c1',
          openAt: 1500,
          closeAt: 2500,
          override: { timeMultiplier: 2 },
          createdAt: 100,
          updatedAt: 100,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    const rows = result.current.assignments.filter(
      (a) => a.sessionId === 'q-targeted'
    );
    expect(rows).toHaveLength(1); // deduped
    expect(rows[0].title).toBe('Targeted Quiz'); // session wins content
    expect(rows[0].openAt).toBe(1500); // pointer wins window
    expect(rows[0].closeAt).toBe(2500);
    expect(rows[0].override).toEqual({ timeMultiplier: 2 });
  });

  it('removes an already-rendered class-channel row when individualTargeting arrives late (no pointer for this student)', async () => {
    const rig = makeSnapshotRig();
    makeGetDocRig();
    rig.setDocs('quiz_sessions', [
      {
        id: 'q-race',
        data: {
          quizTitle: 'Race Quiz',
          classIds: ['c1'],
          status: 'active',
          createdAt: 100,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(
        result.current.assignments.some((a) => a.sessionId === 'q-race')
      ).toBe(true);
    });

    // The individualTargeting flag lands after the initial render — this
    // student has no pointer doc (not one of the targeted students), so the
    // class channel must drop the already-rendered row.
    rig.setDocs('quiz_sessions', [
      {
        id: 'q-race',
        data: {
          quizTitle: 'Race Quiz',
          classIds: ['c1'],
          status: 'active',
          createdAt: 100,
          individualTargeting: true,
        },
      },
    ]);

    await waitFor(() => {
      expect(
        result.current.assignments.some((a) => a.sessionId === 'q-race')
      ).toBe(false);
    });
  });

  it('hydrates a pointer via direct getDoc when the session is in no class-channel bucket (GL has no ended channel)', async () => {
    const rig = makeSnapshotRig();
    const getDocRig = makeGetDocRig();
    // guided_learning_sessions delivers nothing for this student's classIds —
    // simulates a GL session that fell out of visibility (GL has only an
    // "active" channel; no ended channel exists at all).
    rig.setDocs('guided_learning_sessions', []);
    getDocRig.setDoc('guided_learning_sessions/gl-hidden', {
      title: 'Hidden GL',
      classIds: ['c1'],
    });
    rig.setDocs('student_assignments/student-a/items', [
      {
        id: 'gl-hidden',
        data: {
          kind: 'guided-learning',
          sessionId: 'gl-hidden',
          teacherUid: 't1',
          classId: 'c1',
          createdAt: 100,
          updatedAt: 100,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      const row = result.current.assignments.find(
        (a) => a.sessionId === 'gl-hidden'
      );
      expect(row).toBeDefined();
      expect(row?.kind).toBe('guided-learning');
      expect(row?.title).toBe('Hidden GL');
    });
  });

  it('drops a pointer whose session doc is missing entirely (deleted assignment)', async () => {
    const rig = makeSnapshotRig();
    makeGetDocRig(); // no docs registered — every getDoc resolves not-exists
    rig.setDocs('quiz_sessions', []);
    rig.setDocs('student_assignments/student-a/items', [
      {
        id: 'quiz-deleted',
        data: {
          kind: 'quiz',
          sessionId: 'quiz-deleted',
          teacherUid: 't1',
          classId: 'c1',
          createdAt: 100,
          updatedAt: 100,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });
    // Give the hydration effect's getDoc a tick to resolve.
    await new Promise((r) => setTimeout(r, 0));

    expect(
      result.current.assignments.some((a) => a.sessionId === 'quiz-deleted')
    ).toBe(false);
  });

  // F4: both orderings of the individualTargeting-flag/pointer race for a
  // TARGETED student (one who DOES have a pointer doc for this session) must
  // converge on the same single, correctly-merged row — never a transient
  // drop, never a duplicate.
  it('race (pointer-before-flag): pointer arrives first, individualTargeting flag arrives late — row survives merged', async () => {
    const rig = makeSnapshotRig();
    makeGetDocRig();
    rig.setDocs('quiz_sessions', [
      {
        id: 'q-race-2',
        data: {
          quizTitle: 'Race Quiz 2',
          classIds: ['c1'],
          status: 'active',
          createdAt: 100,
          openAt: 1000,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(
        result.current.assignments.some((a) => a.sessionId === 'q-race-2')
      ).toBe(true);
    });

    // Pointer arrives first (this student IS targeted for this session).
    rig.setDocs('student_assignments/student-a/items', [
      {
        id: 'q-race-2',
        data: {
          kind: 'quiz',
          sessionId: 'q-race-2',
          teacherUid: 't1',
          classId: 'c1',
          openAt: 1500,
          createdAt: 100,
          updatedAt: 100,
        },
      },
    ]);

    await waitFor(() => {
      const row = result.current.assignments.find(
        (a) => a.sessionId === 'q-race-2'
      );
      expect(row?.openAt).toBe(1500); // pointer already wins
    });

    // The individualTargeting flag lands late.
    rig.setDocs('quiz_sessions', [
      {
        id: 'q-race-2',
        data: {
          quizTitle: 'Race Quiz 2',
          classIds: ['c1'],
          status: 'active',
          createdAt: 100,
          openAt: 1000,
          individualTargeting: true,
        },
      },
    ]);

    await waitFor(() => {
      const rows = result.current.assignments.filter(
        (a) => a.sessionId === 'q-race-2'
      );
      // Converges: exactly one row, still pointer-merged, never dropped —
      // the pointer keeps it alive via rawByKindSession (unfiltered).
      expect(rows).toHaveLength(1);
      expect(rows[0].openAt).toBe(1500);
      expect(rows[0].title).toBe('Race Quiz 2');
    });
  });

  it('race (flag-before-pointer): individualTargeting flag arrives first, pointer arrives late — row appears merged once the pointer lands', async () => {
    const rig = makeSnapshotRig();
    makeGetDocRig();
    // The flag is present from the very first snapshot — the class channel
    // must exclude it immediately, before this student's pointer exists.
    rig.setDocs('quiz_sessions', [
      {
        id: 'q-race-3',
        data: {
          quizTitle: 'Race Quiz 3',
          classIds: ['c1'],
          status: 'active',
          createdAt: 100,
          openAt: 1000,
          individualTargeting: true,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });
    // No pointer yet — the targeted-but-not-yet-pointed row is correctly
    // absent (not this student's copy, or not delivered yet).
    expect(
      result.current.assignments.some((a) => a.sessionId === 'q-race-3')
    ).toBe(false);

    // The pointer arrives late — this student IS targeted.
    rig.setDocs('student_assignments/student-a/items', [
      {
        id: 'q-race-3',
        data: {
          kind: 'quiz',
          sessionId: 'q-race-3',
          teacherUid: 't1',
          classId: 'c1',
          openAt: 1500,
          createdAt: 100,
          updatedAt: 100,
        },
      },
    ]);

    await waitFor(() => {
      const rows = result.current.assignments.filter(
        (a) => a.sessionId === 'q-race-3'
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].openAt).toBe(1500); // pointer wins window
      expect(rows[0].title).toBe('Race Quiz 3'); // session wins content
    });
  });

  // F1: a transient getDoc REJECTION must never be cached the same way as a
  // confirmed-missing session — it should surface as a (retryable) error,
  // not silently and permanently hide the assignment.
  it('a transient getDoc rejection surfaces as an error and is not cached as missing — retry recovers the row', async () => {
    const rig = makeSnapshotRig();
    const getDocRig = makeFlakyGetDocRig();
    rig.setDocs('guided_learning_sessions', []); // GL has no ended channel
    getDocRig.setDoc('guided_learning_sessions/gl-transient', {
      title: 'Transient GL',
      classIds: ['c1'],
    });
    getDocRig.rejectNextNCalls('guided_learning_sessions/gl-transient', 1);
    rig.setDocs('student_assignments/student-a/items', [
      {
        id: 'gl-transient',
        data: {
          kind: 'guided-learning',
          sessionId: 'gl-transient',
          teacherUid: 't1',
          classId: 'c1',
          createdAt: 100,
          updatedAt: 100,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
      // The fetch failed — the error must be surfaced (feeds the existing
      // partial-failure banner/retry path), not swallowed.
      expect(result.current.hasErrors).toBe(true);
    });
    // Never cached as confirmed-missing: the row stays absent while errored
    // (not yet resolved), but the failure is visible via hasErrors, and a
    // full-screen wipe is NOT warranted since this is the pointer channel.
    expect(
      result.current.assignments.some((a) => a.sessionId === 'gl-transient')
    ).toBe(false);

    // Retry re-runs the hydration fetch from a clean slate; this time
    // getDoc resolves successfully and the row comes back.
    result.current.retry();

    await waitFor(() => {
      const row = result.current.assignments.find(
        (a) => a.sessionId === 'gl-transient'
      );
      expect(row).toBeDefined();
      expect(row?.title).toBe('Transient GL');
    });
    expect(result.current.hasErrors).toBe(false);
  });
});
