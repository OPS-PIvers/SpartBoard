import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useQuizSessionStudent } from '@/hooks/useQuizSession';
import { auth } from '@/config/firebase';
import type { QuizSession } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/utils/quizJoinCodes', () => ({
  findQuizSessionsByCode: vi.fn(async () => {
    const { getDocs } = await import('firebase/firestore');
    const snap = (await (getDocs as unknown as () => Promise<unknown>)()) as
      { docs?: { id: string; data: () => unknown }[] } | undefined;
    return (snap?.docs ?? []).map((d) => ({ id: d.id, data: d.data() }));
  }),
  addJoinCodePointerToBatch: vi.fn(),
  deleteJoinCodePointerFromBatch: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon-uid' } }),
}));

type Doc = Record<string, unknown> & {
  answers: Record<string, unknown>[];
};
const stamp = (seconds: number) => ({ seconds, nanoseconds: 0 });

describe('useQuizSessionStudent: the dictated marker', () => {
  // The server's copy of the response doc. Transactions read and write it;
  // the listener cache only changes when a test calls `deliver()`.
  let server: Doc;
  let clock = 10;
  let responseCallback: ((snap: unknown) => void) | null = null;

  const updateMock = () =>
    firestore.updateDoc as unknown as ReturnType<typeof vi.fn>;
  const txMock = () =>
    firestore.runTransaction as unknown as ReturnType<typeof vi.fn>;

  function applyToServer(patch: Record<string, unknown>) {
    clock += 1;
    server = { ...server, ...patch, lastWriteAt: stamp(clock) };
  }

  function deliver(opts: { pending?: boolean } = {}) {
    const data = { ...server };
    act(() => {
      responseCallback?.({
        exists: () => true,
        id: 'student-uid-1',
        data: () => data,
        metadata: { hasPendingWrites: opts.pending === true },
      });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    responseCallback = null;
    clock = 10;
    (firestore.getDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { exists: () => false }
    );
    (auth as unknown as { currentUser: { uid: string } | null }).currentUser = {
      uid: 'student-uid-1',
    };
    let snapshotCallIndex = 0;
    (
      firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(
      (_target: unknown, onNext: (snap: unknown) => void) => {
        if (snapshotCallIndex === 1) responseCallback = onNext;
        snapshotCallIndex += 1;
        return vi.fn();
      }
    );
    (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
    (
      firestore.arrayUnion as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((id: string) => ({ union: id }));
    (
      firestore.collection as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({});
    (firestore.query as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {}
    );
    (firestore.where as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {}
    );
    (firestore.setDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );
    (firestore.addDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );
    updateMock().mockImplementation(
      (_ref: unknown, patch: Record<string, unknown>) => {
        applyToServer(patch);
        return Promise.resolve();
      }
    );
    txMock().mockImplementation(
      async (
        _db: unknown,
        updateFn: (tx: {
          get: (ref: unknown) => Promise<{
            exists: () => boolean;
            data: () => Record<string, unknown>;
          }>;
          update: (ref: unknown, patch: Record<string, unknown>) => void;
        }) => Promise<unknown>
      ) => {
        let patch: Record<string, unknown> | null = null;
        const read = { ...server };
        const returned = await updateFn({
          get: () => Promise.resolve({ exists: () => true, data: () => read }),
          update: (_ref, p) => {
            patch = p;
          },
        });
        if (patch) applyToServer(patch);
        return returned;
      }
    );
  });

  async function joinWith(
    answers: Record<string, unknown>[],
    extra: {
      session?: Partial<QuizSession>;
      response?: Record<string, unknown>;
    } = {}
  ) {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'sess-1',
          data: () =>
            ({
              status: 'active',
              mediaResponseEnabled: true,
              ...extra.session,
            }) as QuizSession,
        },
      ],
    });
    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123', '1234');
    });
    server = {
      studentUid: 'student-uid-1',
      status: 'in-progress',
      answers,
      lastWriteAt: stamp(clock),
      ...extra.response,
    };
    deliver();
    return result;
  }

  const markerWrites = () =>
    updateMock().mock.calls.filter(
      ([, patch]) => 'dictated' in (patch as Record<string, unknown>)
    );

  it('writes the question id once when an answer was dictated', async () => {
    const result = await joinWith([]);
    await act(async () => {
      await result.current.submitAnswer('q1', 'spoken words', 0, {
        isDraft: true,
        dictated: true,
      });
    });
    await act(async () => {
      await result.current.submitAnswer('q1', 'spoken words and more', 0, {
        dictated: true,
      });
    });
    expect(markerWrites()).toHaveLength(1);
    expect(markerWrites()[0][1]).toEqual({ dictated: { union: 'q1' } });
    expect(server.answers.find((a) => a.questionId === 'q1')?.answer).toBe(
      'spoken words and more'
    );
  });

  it('writes nothing for a typed answer', async () => {
    const result = await joinWith([]);
    await act(async () => {
      await result.current.submitAnswer('q1', 'typed', 0, { isDraft: true });
    });
    expect(markerWrites()).toHaveLength(0);
  });

  it('skips a question the response already lists', async () => {
    const result = await joinWith([], { response: { dictated: ['q1'] } });
    await act(async () => {
      await result.current.submitAnswer('q1', 'again', 0, { dictated: true });
    });
    await act(async () => {
      await result.current.submitAnswer('q2', 'new', 0, { dictated: true });
    });
    expect(markerWrites().map((call): unknown => call[1])).toEqual([
      { dictated: { union: 'q2' } },
    ]);
  });

  it('leaves a turned-in attempt alone', async () => {
    const result = await joinWith([], { response: { status: 'completed' } });
    await act(async () => {
      await result.current.submitAnswer('q1', 'late', 0, { dictated: true });
    });
    expect(markerWrites()).toHaveLength(0);
  });
});
