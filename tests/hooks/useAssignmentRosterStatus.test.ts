import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

interface FakeDoc {
  id: string;
  data: () => Record<string, unknown>;
}
interface FakeSnapshot {
  forEach: (cb: (d: FakeDoc) => void) => void;
}

const collectionListeners = new Map<string, (snap: FakeSnapshot) => void>();
const docListeners = new Map<string, (snap: { data: () => unknown }) => void>();

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
    __isCollection: true,
  }),
  doc: (_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
    __isCollection: false,
  }),
  onSnapshot: (
    ref: { __path: string; __isCollection: boolean },
    onNext: (snap: unknown) => void
  ) => {
    if (ref.__isCollection) collectionListeners.set(ref.__path, onNext);
    else docListeners.set(ref.__path, onNext);
    return () => {
      if (ref.__isCollection) collectionListeners.delete(ref.__path);
      else docListeners.delete(ref.__path);
    };
  },
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

import { useAssignmentRosterStatus } from '@/hooks/useAssignmentRosterStatus';

function fakeSnapshot(docs: FakeDoc[]): FakeSnapshot {
  return { forEach: (cb) => docs.forEach(cb) };
}

beforeEach(() => {
  collectionListeners.clear();
  docListeners.clear();
});

describe('useAssignmentRosterStatus', () => {
  it('derives quiz statuses from the responses subcollection and totalQuestions from the session doc', async () => {
    const { result } = renderHook(() =>
      useAssignmentRosterStatus('quiz', 'session-1')
    );
    expect(result.current.loading).toBe(true);

    const responsesPath = 'quiz_sessions/session-1/responses';
    const sessionPath = 'quiz_sessions/session-1';
    expect(collectionListeners.has(responsesPath)).toBe(true);
    expect(docListeners.has(sessionPath)).toBe(true);

    act(() => {
      collectionListeners.get(responsesPath)?.(
        fakeSnapshot([
          { id: 'uid-a', data: () => ({ status: 'in-progress' }) },
          {
            id: 'uid-b',
            data: () => ({ status: 'completed', grading: { q1: {} } }),
          },
        ])
      );
      docListeners.get(sessionPath)?.({ data: () => ({ totalQuestions: 10 }) });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statusByUid.get('uid-a')).toBe('in-progress');
    expect(result.current.statusByUid.get('uid-b')).toBe('graded');
    expect(result.current.totalQuestions).toBe(10);
  });

  it('derives mini-app statuses as submitted from submission doc existence, with no session lookup', async () => {
    const { result } = renderHook(() =>
      useAssignmentRosterStatus('mini-app', 'session-2')
    );
    const submissionsPath = 'mini_app_sessions/session-2/submissions';
    expect(collectionListeners.has(submissionsPath)).toBe(true);
    expect(docListeners.size).toBe(0);

    act(() => {
      collectionListeners.get(submissionsPath)?.(
        fakeSnapshot([{ id: 'pseudo-1', data: () => ({ submittedAt: 1 }) }])
      );
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statusByUid.get('pseudo-1')).toBe('submitted');
    expect(result.current.totalQuestions).toBeNull();
  });

  it('returns the empty result and subscribes nothing when sessionId is absent', () => {
    const { result } = renderHook(() =>
      useAssignmentRosterStatus('quiz', null)
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.statusByUid.size).toBe(0);
    expect(collectionListeners.size).toBe(0);
  });
});
