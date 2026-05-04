import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useStudentAssignments } from '@/hooks/useStudentAssignments';

/**
 * Pins the view-only filter behavior in `useStudentAssignments`. View-only
 * sessions are shared links, not assignments — they must never appear on a
 * student's `/my-assignments` page. The filter checks BOTH the `mode` field
 * (Quiz, Video Activity, Mini App) and `assignmentMode` (Guided Learning),
 * because GL's session doc already has `mode` for play-mode and uses
 * `assignmentMode` for the assignment-mode value (documented in `types.ts`).
 *
 * The asymmetry is the regression-prone part: a refactor that consolidates
 * to a single field name will silently break GL filtering unless this test
 * catches it.
 */

vi.mock('firebase/firestore', async () => {
  const actual =
    await vi.importActual<typeof import('firebase/firestore')>(
      'firebase/firestore'
    );
  return {
    ...actual,
    collection: vi.fn((_db: unknown, name: string) => ({ __name: name })),
    query: vi.fn((ref: unknown) => ref),
    where: vi.fn(() => ({})),
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

interface CollectionRef {
  __name?: string;
}

interface FakeSnapshot {
  docs: { id: string; data: () => Record<string, unknown> }[];
}
type SnapshotCallback = (snap: FakeSnapshot) => void;

/**
 * Configure the `onSnapshot` mock so each subscribed collection delivers a
 * specific list of docs synchronously on first call. Other collections (the
 * 5 session kinds × 2 channels × 2 shapes that the hook subscribes to)
 * deliver an empty list so the loadState progresses to 'ready'.
 *
 * The cast on `mockImplementation` works around `onSnapshot`'s heavily
 * overloaded signature (the real type accepts up to 5 args across its
 * overloads); the mock only needs the (ref, onNext) shape the hook uses.
 */
function deliverDocsByCollection(
  byCollection: Record<string, FakeDoc[]>
): void {
  const impl = (ref: unknown, onNext: SnapshotCallback): (() => void) => {
    const name = (ref as CollectionRef).__name ?? '';
    const docs = (byCollection[name] ?? []).map((d) => ({
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

describe('useStudentAssignments — view-only filter', () => {
  it("filters out Quiz sessions with mode === 'view-only'", async () => {
    deliverDocsByCollection({
      quiz_sessions: [
        {
          id: 'quiz-submissions',
          data: {
            quizTitle: 'Submissions Quiz',
            classIds: ['c1'],
            mode: 'submissions',
            status: 'active',
            createdAt: 100,
          },
        },
        {
          id: 'quiz-view-only',
          data: {
            quizTitle: 'View-only Quiz',
            classIds: ['c1'],
            mode: 'view-only',
            status: 'active',
            createdAt: 200,
          },
        },
        {
          id: 'quiz-legacy',
          data: {
            // No `mode` field — pre-feature session. Must pass through
            // unchanged so the existing My Assignments behavior holds.
            quizTitle: 'Legacy Quiz',
            classIds: ['c1'],
            status: 'active',
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

    const ids = result.current.assignments.map((a) => a.sessionId);
    expect(ids).toContain('quiz-submissions');
    expect(ids).toContain('quiz-legacy');
    expect(ids).not.toContain('quiz-view-only');
  });

  it("filters out Guided Learning sessions with assignmentMode === 'view-only'", async () => {
    deliverDocsByCollection({
      guided_learning_sessions: [
        {
          id: 'gl-submissions',
          data: {
            title: 'Submissions GL',
            classIds: ['c1'],
            // GL's session `mode` field is play-mode (structured / guided /
            // explore) — completely orthogonal to the assignment mode.
            mode: 'guided',
            assignmentMode: 'submissions',
            createdAt: 100,
          },
        },
        {
          id: 'gl-view-only',
          data: {
            title: 'View-only GL',
            classIds: ['c1'],
            mode: 'guided',
            assignmentMode: 'view-only',
            createdAt: 200,
          },
        },
        {
          id: 'gl-leak-test',
          data: {
            // The trap: this doc has play-mode 'view-only' (which is NOT a
            // real GuidedLearningMode value, but a refactor that
            // accidentally collapses the two fields would mishandle this).
            // The filter must check `assignmentMode`, not `mode`, for GL.
            title: 'Leak Test GL',
            classIds: ['c1'],
            mode: 'view-only', // <-- play-mode field, must not gate
            assignmentMode: 'submissions',
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

    const ids = result.current.assignments.map((a) => a.sessionId);
    expect(ids).toContain('gl-submissions');
    // gl-leak-test has play-mode 'view-only' but assignmentMode 'submissions'
    // — must surface (the filter incorrectly checking `mode` would drop it).
    expect(ids).toContain('gl-leak-test');
    expect(ids).not.toContain('gl-view-only');
  });

  it('filters across all four widget kinds in a single pass', async () => {
    deliverDocsByCollection({
      quiz_sessions: [
        {
          id: 'q-show',
          data: { quizTitle: 'Q', classIds: ['c1'], status: 'active' },
        },
        {
          id: 'q-hide',
          data: {
            quizTitle: 'Q',
            classIds: ['c1'],
            status: 'active',
            mode: 'view-only',
          },
        },
      ],
      video_activity_sessions: [
        {
          id: 'va-show',
          data: { activityTitle: 'V', classIds: ['c1'], status: 'active' },
        },
        {
          id: 'va-hide',
          data: {
            activityTitle: 'V',
            classIds: ['c1'],
            status: 'active',
            mode: 'view-only',
          },
        },
      ],
      mini_app_sessions: [
        {
          id: 'ma-show',
          data: { appTitle: 'M', classIds: ['c1'], status: 'active' },
        },
        {
          id: 'ma-hide',
          data: {
            appTitle: 'M',
            classIds: ['c1'],
            status: 'active',
            mode: 'view-only',
          },
        },
      ],
      guided_learning_sessions: [
        {
          id: 'gl-show',
          data: { title: 'G', classIds: ['c1'] },
        },
        {
          id: 'gl-hide',
          data: { title: 'G', classIds: ['c1'], assignmentMode: 'view-only' },
        },
      ],
    });

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    const ids = result.current.assignments.map((a) => a.sessionId);
    expect(ids).toEqual(
      expect.arrayContaining(['q-show', 'va-show', 'ma-show', 'gl-show'])
    );
    expect(ids).not.toContain('q-hide');
    expect(ids).not.toContain('va-hide');
    expect(ids).not.toContain('ma-hide');
    expect(ids).not.toContain('gl-hide');
  });
});
