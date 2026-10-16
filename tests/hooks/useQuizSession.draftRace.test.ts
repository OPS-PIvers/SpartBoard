import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import {
  useQuizSessionStudent,
  isWriteAtAfter,
  settleDraftsWithin,
} from '@/hooks/useQuizSession';
import { auth } from '@/config/firebase';
import { makeTestArtifact } from '@/tests/testHelpers/responseArtifacts';
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

// Finding #16: a draft autosave rebuilt `answers` from the listener cache and
// could undo a transactional write the listener had not echoed yet.
describe('useQuizSessionStudent — draft autosave vs transactional writes', () => {
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

  async function joinWith(answers: Record<string, unknown>[]) {
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
    };
    deliver();
    return result;
  }

  const draftQ1 = {
    questionId: 'q1',
    answer: 'first words',
    answeredAt: 100,
    status: 'draft',
  };

  it('keeps a just-submitted answer when a draft autosave fires before the listener echoes it', async () => {
    const result = await joinWith([draftQ1]);
    await act(async () => {
      await result.current.submitAnswer('q2', 'B');
    });
    expect(server.answers.find((a) => a.questionId === 'q2')?.status).toBe(
      'submitted'
    );

    await act(async () => {
      await result.current.submitAnswer('q1', 'first words and more', 0, {
        isDraft: true,
      });
    });

    const q2 = server.answers.find((a) => a.questionId === 'q2');
    expect(q2).toMatchObject({ answer: 'B', status: 'submitted' });
    expect(server.answers.find((a) => a.questionId === 'q1')?.answer).toBe(
      'first words and more'
    );
  });

  it('keeps a just-committed recording take through a later draft autosave', async () => {
    const result = await joinWith([draftQ1]);
    await act(async () => {
      await result.current.commitRecordingTake({
        questionId: 'rec',
        artifact: makeTestArtifact({ id: 'take-1' }),
      });
    });

    await act(async () => {
      await result.current.submitAnswer('q1', 'first words, edited', 0, {
        isDraft: true,
      });
    });

    expect(server.answers.some((a) => a.questionId === 'rec')).toBe(true);
  });

  it('chains consecutive drafts on top of the committed answers until the listener catches up', async () => {
    const result = await joinWith([draftQ1]);
    await act(async () => {
      await result.current.submitAnswer('q2', 'B');
    });
    await act(async () => {
      await result.current.submitAnswer('q1', 'one', 0, { isDraft: true });
    });
    // The listener reports the cache plus the pending draft only.
    deliver({ pending: true });
    await act(async () => {
      await result.current.submitAnswer('q3', 'three', 0, { isDraft: true });
    });

    const ids = server.answers.map((a) => a.questionId).sort();
    expect(ids).toEqual(['q1', 'q2', 'q3']);
  });

  it('goes back to the listener once it delivers a server snapshot newer than the commit', async () => {
    const result = await joinWith([draftQ1]);
    await act(async () => {
      await result.current.submitAnswer('q2', 'B');
    });
    // Teacher-side change after the commit, then the listener catches up.
    server = {
      ...server,
      answers: server.answers.map((a) =>
        a.questionId === 'q2' ? { ...a, teacherNote: 'kept' } : a
      ),
    };
    deliver();

    await act(async () => {
      await result.current.submitAnswer('q1', 'later', 0, { isDraft: true });
    });

    expect(server.answers.find((a) => a.questionId === 'q2')).toMatchObject({
      teacherNote: 'kept',
    });
  });

  it('holds a submit until an in-flight draft autosave is acknowledged', async () => {
    const result = await joinWith([draftQ1]);
    const ack: { draft?: () => void } = {};
    updateMock().mockImplementationOnce(
      (_ref: unknown, patch: Record<string, unknown>) =>
        new Promise<void>((resolve) => {
          ack.draft = () => {
            applyToServer(patch);
            resolve();
          };
        })
    );

    let draftDone: Promise<void> = Promise.resolve();
    let submitDone: Promise<void> = Promise.resolve();
    await act(async () => {
      draftDone = result.current.submitAnswer('q1', 'typed', 0, {
        isDraft: true,
      });
      submitDone = result.current.submitAnswer('q2', 'B');
      await Promise.resolve();
    });
    expect(txMock()).not.toHaveBeenCalled();

    await act(async () => {
      ack.draft?.();
      await draftDone;
      await submitDone;
    });

    expect(txMock()).toHaveBeenCalledTimes(1);
    const ids = server.answers.map((a) => a.questionId).sort();
    expect(ids).toEqual(['q1', 'q2']);
  });

  it('still writes a draft with one updateDoc and no transaction', async () => {
    const result = await joinWith([draftQ1]);
    updateMock().mockClear();
    await act(async () => {
      await result.current.submitAnswer('q1', 'typing', 0, { isDraft: true });
    });
    expect(updateMock()).toHaveBeenCalledTimes(1);
    expect(txMock()).not.toHaveBeenCalled();
  });
});

describe('isWriteAtAfter', () => {
  it('orders by seconds then nanoseconds', () => {
    expect(isWriteAtAfter(stamp(2), stamp(1))).toBe(true);
    expect(isWriteAtAfter(stamp(1), stamp(1))).toBe(false);
    expect(
      isWriteAtAfter(
        { seconds: 1, nanoseconds: 5 },
        { seconds: 1, nanoseconds: 4 }
      )
    ).toBe(true);
  });

  it('treats a missing base as older and a pending stamp as not newer', () => {
    expect(isWriteAtAfter(stamp(1), undefined)).toBe(true);
    expect(isWriteAtAfter(null, stamp(1))).toBe(false);
    expect(isWriteAtAfter(undefined, undefined)).toBe(false);
  });
});

describe('settleDraftsWithin', () => {
  it('gives up after the timeout when a draft never settles', async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      const p = settleDraftsWithin(
        [new Promise<never>(() => undefined)],
        4000
      ).then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(3999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
