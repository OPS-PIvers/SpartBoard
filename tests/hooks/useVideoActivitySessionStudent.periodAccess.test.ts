// Per-period VA joins: classId + seat in one batch, the assessment-mode sign-in refusal,
// the content-doc merge, and a retake reset that waits for the period to open.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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
import type {
  PeriodAccess,
  VideoActivityPublicQuestion,
  VideoActivitySession,
} from '@/types';

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
type SnapCb = (snap: { exists: () => boolean; data: () => unknown }) => void;

const period = (
  state: PeriodAccess['state'],
  label: string,
  over: Partial<PeriodAccess> = {}
): PeriodAccess => ({
  state,
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
  ...over,
});

const QUESTIONS: VideoActivityPublicQuestion[] = [
  { id: 'q1', timestamp: 5, text: 'Why?', type: 'MC', options: ['a', 'b'] },
] as VideoActivityPublicQuestion[];

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
    questionsInContent: true,
    status: 'active',
    allowedPins: [],
    createdAt: 1,
    classIds: ['A', 'B'],
    accessMode: 'assignment',
    periodAccess: { A: period('closed', 'P1'), B: period('open', 'P3') },
    ...over,
  } as VideoActivitySession;
}

let docs: Record<string, unknown>;
let snapCbs: Record<string, SnapCb>;
const batchSet = vi.fn();
const batchCommit = vi.fn();

function signInAs(uid: string, isAnonymous: boolean, classIds: string[]) {
  (auth as unknown as { currentUser: unknown }).currentUser = {
    uid,
    isAnonymous,
    getIdTokenResult: () => Promise.resolve({ claims: { classIds } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  docs = {};
  snapCbs = {};
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
  (onSnapshot as Mock).mockImplementation((ref: Ref, cb: SnapCb) => {
    snapCbs[ref.path] = cb;
    return () => undefined;
  });
  (setDoc as Mock).mockResolvedValue(undefined);
  (updateDoc as Mock).mockResolvedValue(undefined);
  const batch = { set: batchSet, commit: batchCommit };
  batchSet.mockReturnValue(batch);
  batchCommit.mockResolvedValue(undefined);
  (writeBatch as Mock).mockReturnValue(batch);
});

async function join(pin?: string, classPeriod?: string) {
  const hook = renderHook(() => useVideoActivitySessionStudent());
  await act(async () => {
    await hook.result.current.joinSession('s1', pin, classPeriod);
  });
  return hook;
}

describe('useVideoActivitySessionStudent — per-period joins', () => {
  it('writes classId on the response and the seat in the same batch', async () => {
    signInAs('sso-1', false, ['A', 'B']);
    docs['video_activity_sessions/s1'] = buildSession();
    const { result } = await join();

    expect(setDoc).not.toHaveBeenCalled();
    const [[responseRef, response], [seat, seatData]] = batchSet.mock.calls as [
      Ref,
      Record<string, unknown>,
    ][];
    expect(responseRef.path).toBe('video_activity_sessions/s1/responses/sso-1');
    expect(response).toMatchObject({
      classId: 'B',
      classPeriod: 'P3',
      answers: [],
    });
    expect(seat.path).toBe('video_activity_sessions/s1/seats/sso-1');
    expect(seatData).toEqual({ responseKey: 'sso-1' });
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(result.current.joinStatus).toBe('joined');
    expect(result.current.periodKeys).toEqual(['A', 'B']);
  });

  it('matches an anonymous PIN joiner to the period they picked', async () => {
    signInAs('anon-1', true, []);
    docs['video_activity_sessions/s1'] = buildSession();
    await join('1234', 'P1');

    const [responseRef, response] = batchSet.mock.calls[0] as [
      Ref,
      Record<string, unknown>,
    ];
    expect(responseRef.id).toBe('pin-p1-1234');
    expect(response).toMatchObject({ classId: 'A', classPeriod: 'P1' });
    const [, seatData] = batchSet.mock.calls[1] as [Ref, unknown];
    expect(seatData).toEqual({ responseKey: 'pin-p1-1234' });
  });

  it('refuses an anonymous PIN joiner in assessment mode', async () => {
    signInAs('anon-1', true, []);
    docs['video_activity_sessions/s1'] = buildSession({
      accessMode: 'assessment',
    });
    const { result } = await join('1234', 'P1');

    expect(result.current.joinStatus).toBe('error');
    expect(result.current.error).toMatch(/school sign-in/);
    expect(batchCommit).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('refuses a student in none of the targeted periods', async () => {
    signInAs('sso-2', false, ['Z']);
    docs['video_activity_sessions/s1'] = buildSession();
    const { result } = await join();

    expect(result.current.error).toMatch(/not in a class/);
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('keeps legacy sessions on a plain setDoc with no classId or seat', async () => {
    signInAs('sso-1', false, ['A']);
    docs['video_activity_sessions/s1'] = buildSession({
      periodAccess: undefined,
      accessMode: undefined,
      questionsInContent: undefined,
      publicQuestions: QUESTIONS,
    });
    const { result } = await join();

    expect(batchCommit).not.toHaveBeenCalled();
    const [ref, response] = (setDoc as Mock).mock.calls[0] as [
      Ref,
      Record<string, unknown>,
    ];
    expect(ref.path).toBe('video_activity_sessions/s1/responses/sso-1');
    expect(response).not.toHaveProperty('classId');
    expect(result.current.periodKeys).toEqual([]);
    expect(result.current.contentPending).toBe(false);
    expect(result.current.session?.publicQuestions).toEqual(QUESTIONS);
  });

  it('merges content/questions into the session once the read is allowed', async () => {
    signInAs('sso-1', false, ['B']);
    docs['video_activity_sessions/s1'] = buildSession();
    const { result } = await join();

    expect(result.current.contentPending).toBe(true);
    expect(result.current.session?.publicQuestions).toEqual([]);
    const contentPath = 'video_activity_sessions/s1/content/questions';
    await waitFor(() => expect(snapCbs[contentPath]).toBeDefined());
    act(() => {
      snapCbs[contentPath]({
        exists: () => true,
        data: () => ({ publicQuestions: QUESTIONS }),
      });
    });
    expect(result.current.contentPending).toBe(false);
    expect(result.current.session?.publicQuestions).toEqual(QUESTIONS);
  });

  it('seats an existing response and defers a retake reset until the period opens', async () => {
    signInAs('sso-1', false, ['A']);
    docs['video_activity_sessions/s1'] = buildSession();
    docs['video_activity_sessions/s1/responses/sso-1'] = {
      studentUid: 'sso-1',
      joinedAt: 1,
      answers: [{ questionId: 'q1', answer: 'a', answeredAt: 2 }],
      completedAt: 3,
      score: null,
      completedAttempts: 1,
      classId: 'A',
      classPeriod: 'P1',
    };
    const { result } = await join();

    expect(updateDoc).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'video_activity_sessions/s1/seats/sso-1',
      }),
      { responseKey: 'sso-1' }
    );
    expect(result.current.joinStatus).toBe('joined');
    expect(result.current.retakePending).toBe(true);

    await waitFor(() =>
      expect(snapCbs['video_activity_sessions/s1']).toBeDefined()
    );
    await act(async () => {
      snapCbs['video_activity_sessions/s1']({
        exists: () => true,
        data: () =>
          buildSession({
            periodAccess: { A: period('open', 'P1'), B: period('open', 'P3') },
          }),
      });
      await Promise.resolve();
    });
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'video_activity_sessions/s1/responses/sso-1',
      }),
      { completedAt: null, answers: [] }
    );
    await waitFor(() => expect(result.current.retakePending).toBe(false));
  });
});
