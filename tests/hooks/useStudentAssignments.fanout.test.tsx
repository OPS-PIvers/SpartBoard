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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useStudentAssignments — fan-out channel (M17 C1)', () => {
  it('legacy-unchanged: identical output with/without studentUid when no pointers or individualTargeting flags exist', async () => {
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

    const withoutUid = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );
    const withUid = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'], studentUid: 'student-a' })
    );

    await waitFor(() => {
      expect(withoutUid.result.current.loadState).toBe('ready');
      expect(withUid.result.current.loadState).toBe('ready');
    });

    expect(withUid.result.current.assignments).toEqual(
      withoutUid.result.current.assignments
    );
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
});
