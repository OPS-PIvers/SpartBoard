import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useQuizSessionStudent } from '@/hooks/useQuizSession';
import { auth } from '@/config/firebase';
import type { QuizSession } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/utils/quizJoinCodes', () => ({
  findQuizSessionsByCode: vi.fn(() =>
    Promise.resolve([
      { id: 'sess-1', data: { status: 'active' } as QuizSession },
    ])
  ),
  addJoinCodePointerToBatch: vi.fn(),
  deleteJoinCodePointerFromBatch: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon-uid' } }),
}));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

// A teacher removing a PIN student deletes their doc; rules then deny the listener.
describe('useQuizSessionStudent — response doc removed by the teacher', () => {
  let onNext: ((snap: unknown) => void) | null = null;
  let onError: ((err: unknown) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    onNext = null;
    onError = null;
    (auth as unknown as { currentUser: { uid: string } | null }).currentUser = {
      uid: 'student-uid-1',
    };
    mocked(firestore.getDoc).mockResolvedValue({ exists: () => false });
    mocked(firestore.doc).mockReturnValue({});
    mocked(firestore.collection).mockReturnValue({});
    mocked(firestore.setDoc).mockResolvedValue(undefined);
    let call = 0;
    mocked(firestore.onSnapshot).mockImplementation(
      (
        _target: unknown,
        next: (snap: unknown) => void,
        error: (err: unknown) => void
      ) => {
        if (call === 1) {
          onNext = next;
          onError = error;
        }
        call += 1;
        return vi.fn();
      }
    );
  });

  it('clears the cached response when the listener is denied', async () => {
    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123', '1234');
    });
    act(() => {
      onNext?.({
        exists: () => true,
        id: 'student-uid-1',
        data: () => ({ studentUid: 'student-uid-1', answers: [] }),
        metadata: { hasPendingWrites: false },
      });
    });
    expect(result.current.myResponse).not.toBeNull();

    act(() => {
      onError?.({ code: 'permission-denied' });
    });
    expect(result.current.myResponse).toBeNull();
    expect(result.current.error).toBe(
      'Lost permission to read your answers. Ask your teacher.'
    );
  });
});
