import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import {
  LISTENER_RETRY_DELAYS_MS,
  useStudentAssignments,
} from '@/hooks/useStudentAssignments';
import { reportStudentLoadIssue } from '@/utils/studentLoadIssue';

vi.mock('firebase/firestore', async () => {
  const actual =
    await vi.importActual<typeof import('firebase/firestore')>(
      'firebase/firestore'
    );
  return {
    ...actual,
    collection: vi.fn((_db: unknown, ...path: string[]) => ({
      __name: path[0],
    })),
    query: vi.fn((ref: unknown) => ref),
    where: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    onSnapshot: vi.fn(),
  };
});

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/studentLoadIssue', () => ({
  reportStudentLoadIssue: vi.fn(),
}));

type Next = (snap: {
  docs: { id: string; data: () => Record<string, unknown> }[];
}) => void;
type Fail = (err: { code: string; message: string }) => void;

const FLASHCARD = {
  id: 'fc-1',
  data: {
    title: 'Unit 2 Vocabulary',
    kind: 'study',
    workKind: 'resource',
    status: 'active',
    classIds: ['c1'],
  },
};

/** Fails the first `failures` flashcard listeners, then delivers the doc. */
function failFlashcardsTimes(failures: number): { calls: () => number } {
  let flashcardCalls = 0;
  vi.mocked(firestore.onSnapshot).mockImplementation(((
    ref: { __name?: string },
    onNext: Next,
    onError: Fail
  ) => {
    const name = ref.__name ?? '';
    if (name === 'flashcard_sessions') {
      flashcardCalls += 1;
      if (flashcardCalls <= failures * 2) {
        onError({ code: 'unavailable', message: 'offline' });
        return () => undefined;
      }
      onNext({ docs: [{ id: FLASHCARD.id, data: () => FLASHCARD.data }] });
      return () => undefined;
    }
    onNext({ docs: [] });
    return () => undefined;
  }) as unknown as typeof firestore.onSnapshot);
  return { calls: () => flashcardCalls };
}

const hasFlashcard = (ids: string[]) => ids.includes('fc-1');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useStudentAssignments — failed listener retry', () => {
  it('resubscribes a failed list and shows the assignment once it loads', () => {
    failFlashcardsTimes(1);
    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    expect(
      hasFlashcard(result.current.assignments.map((a) => a.sessionId))
    ).toBe(false);
    expect(result.current.hasErrors).toBe(true);

    act(() => {
      vi.advanceTimersByTime(LISTENER_RETRY_DELAYS_MS[0]);
    });

    expect(
      hasFlashcard(result.current.assignments.map((a) => a.sessionId))
    ).toBe(true);
    expect(result.current.hasErrors).toBe(false);
    expect(reportStudentLoadIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'class',
        collection: 'flashcard_sessions',
        code: 'unavailable',
        attempt: 0,
        gaveUp: false,
      })
    );
  });

  it('gives up after the last delay and reports it', () => {
    const { calls } = failFlashcardsTimes(99);
    const { result } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );

    for (const delay of LISTENER_RETRY_DELAYS_MS) {
      act(() => {
        vi.advanceTimersByTime(delay);
      });
    }
    const afterAll = calls();
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });

    // Active + ended listeners, each tried once plus once per delay.
    expect(afterAll).toBe(2 * (LISTENER_RETRY_DELAYS_MS.length + 1));
    expect(calls()).toBe(afterAll);
    expect(result.current.hasErrors).toBe(true);
    expect(reportStudentLoadIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flashcard_sessions',
        gaveUp: true,
      })
    );
  });

  it('stops pending retries on unmount', () => {
    const { calls } = failFlashcardsTimes(99);
    const { unmount } = renderHook(() =>
      useStudentAssignments({ classIds: ['c1'] })
    );
    const before = calls();
    unmount();
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(calls()).toBe(before);
  });
});
