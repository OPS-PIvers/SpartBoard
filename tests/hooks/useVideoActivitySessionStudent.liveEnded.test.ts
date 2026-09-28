// A live student who reloads after the teacher ends lands on the completion screen, read-only.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth } from '@/config/firebase';
import { useVideoActivitySessionStudent } from '@/hooks/useVideoActivitySession';
import type { VideoActivityResponse, VideoActivitySession } from '@/types';
import { initialVideoActivityLiveState } from '@/utils/videoActivityLive';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
  writeBatch: vi.fn(),
  arrayUnion: vi.fn(),
  increment: vi.fn(),
  runTransaction: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  query: vi.fn(),
}));

vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
}));

type Ref = { path: string; id: string };

const SESSION_PATH = 'video_activity_sessions/s1';
const RESPONSE_PATH = 'video_activity_sessions/s1/responses/sso-1';

function buildSession(
  over: Partial<VideoActivitySession> = {}
): VideoActivitySession {
  return {
    id: 's1',
    activityId: 'act-1',
    activityTitle: 'Mitosis',
    teacherUid: 't1',
    youtubeUrl: 'https://youtu.be/abc',
    questions: [],
    publicQuestions: [],
    status: 'ended',
    allowedPins: [],
    createdAt: 1,
    expiresAt: 2,
    sessionMode: 'teacher',
    live: { ...initialVideoActivityLiveState(0), askedQuestionIds: ['q1'] },
    sessionOptions: { attemptLimit: 1 },
    ...over,
  } as VideoActivitySession;
}

const answered: VideoActivityResponse = {
  studentUid: 'sso-1',
  joinedAt: 1,
  answers: [{ questionId: 'q1', answer: 'a', answeredAt: 2 }],
  completedAt: 3,
  score: 100,
  completedAttempts: 1,
};

let docs: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  docs = {};
  (auth as unknown as { currentUser: unknown }).currentUser = {
    uid: 'sso-1',
    isAnonymous: false,
    getIdTokenResult: () => Promise.resolve({ claims: { classIds: [] } }),
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
  (setDoc as Mock).mockResolvedValue(undefined);
  (updateDoc as Mock).mockResolvedValue(undefined);
  (writeBatch as Mock).mockReturnValue({ set: vi.fn(), commit: vi.fn() });
});

async function join() {
  const hook = renderHook(() => useVideoActivitySessionStudent());
  await act(async () => {
    await hook.result.current.joinSession('s1', undefined);
  });
  return hook;
}

describe('useVideoActivitySessionStudent — ended live session', () => {
  it('loads an ended live session for a student who already answered', async () => {
    docs[SESSION_PATH] = buildSession();
    docs[RESPONSE_PATH] = answered;
    const { result } = await join();

    expect(result.current.joinStatus).toBe('joined');
    expect(result.current.session?.status).toBe('ended');
    // No attempt reset, no new response, no seat.
    expect(updateDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('turns away a student with no response in the ended live session', async () => {
    docs[SESSION_PATH] = buildSession();
    const { result } = await join();

    expect(result.current.joinStatus).toBe('error');
    expect(result.current.error).toMatch(/closed by your teacher/);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('still closes an ended self-paced session to a returning student', async () => {
    docs[SESSION_PATH] = buildSession({ sessionMode: undefined, live: undefined });
    docs[RESPONSE_PATH] = answered;
    const { result } = await join();

    expect(result.current.joinStatus).toBe('error');
    expect(result.current.error).toMatch(/closed by your teacher/);
  });
});
