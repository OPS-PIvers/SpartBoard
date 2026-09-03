import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useStudentAssignments } from '@/hooks/useStudentAssignments';

/**
 * P3-2: `useStudentAssignments` must carry `acceptingResponses`,
 * `publiclyShared`, and `latestShareCode` through onto the Activity Wall
 * summary, and a closed wall must still land in the 'active' channel (it
 * has no ended-status concept — closing only blocks new posts).
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

describe('useStudentAssignments — Activity Wall continuity fields', () => {
  it('carries acceptingResponses/publiclyShared/latestShareCode and keeps a closed wall active', async () => {
    deliverDocsByCollection({
      activity_wall_sessions: [
        {
          id: 'wall-closed-with-gallery',
          data: {
            title: 'Closed Wall',
            classId: 'c1',
            acceptingResponses: false,
            publiclyShared: true,
            latestShareCode: 'abc123',
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

    const wall = result.current.assignments.find(
      (a) => a.sessionId === 'wall-closed-with-gallery'
    );
    expect(wall).toBeDefined();
    expect(wall?.acceptingResponses).toBe(false);
    expect(wall?.publiclyShared).toBe(true);
    expect(wall?.latestShareCode).toBe('abc123');
    // Activity Wall has no ended-status concept — a closed wall still
    // surfaces on the 'active' channel so it stays out of Completed.
    expect(wall?.channel).toBe('active');
  });

  it('leaves gallery fields undefined when the session has none', async () => {
    deliverDocsByCollection({
      activity_wall_sessions: [
        {
          id: 'wall-open',
          data: { title: 'Open Wall', classId: 'c1', acceptingResponses: true },
        },
      ],
    });

    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    const wall = result.current.assignments.find(
      (a) => a.sessionId === 'wall-open'
    );
    expect(wall?.acceptingResponses).toBe(true);
    expect(wall?.publiclyShared).toBeUndefined();
    expect(wall?.latestShareCode).toBeUndefined();
  });
});
