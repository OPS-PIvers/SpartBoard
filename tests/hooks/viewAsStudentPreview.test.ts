// View as student (docs/plans/ADMIN_VIEW_AS.md D15): a preview loads the student's work and writes nothing.
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth } from '@/config/firebase';
import { useVideoActivitySessionStudent } from '@/hooks/useVideoActivitySession';
import { useQuizSessionStudent } from '@/hooks/useQuizSession';
import { useGuidedLearningSessionStudent } from '@/hooks/useGuidedLearningSession';
import { useQuizScoreOnSubmit } from '@/hooks/useQuizScoreOnSubmit';
import {
  createPost,
  deletePost,
  EMPTY_DRAFT,
  PostSubmitError,
} from '@/components/activityWall/submission/submitPost';
import { updateViewAsTabState } from '@/utils/viewAsTab';
import type {
  ActivityWallSession,
  GuidedLearningResponse,
  QuizSession,
  VideoActivitySession,
} from '@/types';

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/storage', () => ({
  deleteObject: vi.fn(),
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
  storage: {},
}));

type Ref = { path: string; id: string };
let docs: Record<string, unknown>;

const WRITES = [setDoc, updateDoc, addDoc, deleteDoc, runTransaction];
const expectNoWrites = () => {
  for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  expect(writeBatch).not.toHaveBeenCalled();
  expect(httpsCallable).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  docs = {};
  (auth as unknown as { currentUser: unknown }).currentUser = {
    uid: 'stu-1',
    isAnonymous: false,
    getIdTokenResult: () =>
      Promise.resolve({ claims: { studentRole: true, classIds: ['c1'] } }),
  };
  (doc as Mock).mockImplementation(
    (_db: unknown, ...segs: string[]): Ref => ({
      path: segs.join('/'),
      id: segs[segs.length - 1],
    })
  );
  (getDoc as Mock).mockImplementation((ref: Ref) =>
    Promise.resolve({
      id: ref.id,
      exists: () => ref.path in docs,
      data: () => docs[ref.path],
    })
  );
  (onSnapshot as Mock).mockReturnValue(() => undefined);
  updateViewAsTabState({
    student: {
      sid: 'sid-1',
      token: 'tok',
      studentUid: 'stu-1',
      kind: 'quiz',
      sessionId: 's1',
      studentKey: 'stu-1',
      expiresAt: Date.now() + 60_000,
    },
  });
});

afterEach(() => {
  updateViewAsTabState({ student: null });
});

describe('Video activity preview', () => {
  it('loads the existing response and never joins, answers or submits', async () => {
    docs['video_activity_sessions/s1'] = {
      id: 's1',
      teacherUid: 't1',
      status: 'active',
      questions: [],
    } as unknown as VideoActivitySession;
    const { result } = renderHook(() => useVideoActivitySessionStudent());
    await act(async () => {
      await result.current.previewResponse('s1', 'stu-1');
    });
    expect(result.current.joinStatus).toBe('joined');
    expect(result.current.responseDocId).toBe('stu-1');
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'video_activity_sessions/s1/responses/stu-1',
      }),
      expect.any(Function),
      expect.any(Function)
    );

    await act(async () => {
      await result.current.joinSession('s1', undefined);
      await result.current.submitAnswer('q1', 'a', true);
      await result.current.completeActivity();
      await result.current.reportTabSwitch();
      await result.current.saveTabExits([]);
    });
    await expect(result.current.checkAnswer('q1', 'a')).rejects.toThrow(
      'View-only'
    );
    expectNoWrites();
  });
});

describe('Quiz preview', () => {
  it('listens to the response without joining, and every write is a no-op', async () => {
    const { result } = renderHook(() => useQuizSessionStudent());
    act(() => result.current.previewResponse('s1', 'pin-p1-01'));
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'quiz_sessions/s1/responses/pin-p1-01',
      }),
      expect.any(Function),
      expect.any(Function)
    );

    await expect(result.current.joinQuizSession('ABC123')).rejects.toThrow(
      'View-only'
    );
    await act(async () => {
      await result.current.submitAnswer('q1', 'a');
      await result.current.completeQuiz();
      await result.current.setHandRaised(true);
      await result.current.startAttemptClock();
      await result.current.reportTabSwitch();
      await result.current.saveTabExits([]);
      await result.current.persistServedDraw(['q1']);
    });
    expectNoWrites();
  });

  it('never asks the server to score a previewed submission', () => {
    renderHook(() =>
      useQuizScoreOnSubmit(
        { id: 's1', showScoreOnSubmit: true } as QuizSession,
        { status: 'completed', score: null, completedAttempts: 1 }
      )
    );
    expectNoWrites();
  });
});

describe('Guided learning preview', () => {
  it('never creates a response or takes a seat', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('s1', 'stu-1')
    );
    const response: GuidedLearningResponse = {
      sessionId: 's1',
      studentAnonymousId: 'stu-1',
      answers: [],
      startedAt: 1,
      completedAt: null,
      score: null,
    };
    await act(async () => {
      await result.current.submitResponse(response);
      await result.current.submitResponse(response, { exists: true });
    });
    expectNoWrites();
  });
});

describe('Activity wall preview', () => {
  it('refuses to post or delete', async () => {
    const session = {
      id: 't1_w1',
      layout: 'grid',
    } as unknown as ActivityWallSession;
    await expect(
      createPost({
        session,
        uid: 'stu-1',
        isGuest: false,
        participantLabel: 'Ann',
        myPosts: [],
        draft: { ...EMPTY_DRAFT, body: 'hi' },
        placement: {},
      })
    ).rejects.toBeInstanceOf(PostSubmitError);
    await expect(deletePost('t1_w1', 'p1')).rejects.toBeInstanceOf(
      PostSubmitError
    );
    expectNoWrites();
  });
});
