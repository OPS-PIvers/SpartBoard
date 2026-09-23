// Per-period GL sessions: the teacher create writes the session and its content doc in one
// batch, and the student hook seats the student, then loads the content once it can.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import {
  useGuidedLearningSessionStudent,
  useGuidedLearningSessionTeacher,
} from '@/hooks/useGuidedLearningSession';
import type {
  GuidedLearningSession,
  GuidedLearningSet,
  PeriodAccess,
} from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/serverTime', () => ({ getServerNow: () => 5_000 }));

type Ref = { path: string };
type Snap = { exists: () => boolean; data: () => unknown };

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

const PERIODS = { A: period('closed', 'P1'), B: period('open', 'P3') };

const set = (): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Cells',
  imageUrls: ['https://img/1.png', 'https://img/2.mp4'],
  imageKinds: ['image', 'video'],
  steps: [
    {
      id: 's1',
      xPct: 1,
      yPct: 2,
      imageIndex: 1,
      interactionType: 'question',
      question: {
        type: 'multiple-choice',
        text: 'Which?',
        choices: ['a', 'b'],
        correctAnswer: 'a',
      },
    },
  ],
  mode: 'guided',
  createdAt: 0,
  updatedAt: 0,
});

const batchSet = vi.fn();
const batchCommit = vi.fn();
let snapCbs: Record<
  string,
  { next: (s: Snap) => void; err: (e: unknown) => void }
>;
let subscriptions: string[];

beforeEach(() => {
  vi.clearAllMocks();
  snapCbs = {};
  subscriptions = [];
  vi.stubGlobal('crypto', { randomUUID: () => 'sess-1' });
  (doc as Mock).mockImplementation(
    (_db: unknown, ...segs: string[]): Ref => ({ path: segs.join('/') })
  );
  (setDoc as Mock).mockResolvedValue(undefined);
  const batch = { set: batchSet, commit: batchCommit };
  batchSet.mockReturnValue(batch);
  batchCommit.mockResolvedValue(undefined);
  (writeBatch as Mock).mockReturnValue(batch);
  (onSnapshot as Mock).mockImplementation(
    (ref: Ref, next: (s: Snap) => void, err: (e: unknown) => void) => {
      snapCbs[ref.path] = { next, err };
      subscriptions.push(ref.path);
      return () => undefined;
    }
  );
});

describe('useGuidedLearningSessionTeacher — per-period create', () => {
  it('writes the session and its content doc in one batch, with no steps on the session', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionTeacher('teacher-1')
    );
    await act(async () => {
      await result.current.createSession(
        set(),
        ['A', 'B'],
        ['P1', 'P3'],
        ['r1', 'r2'],
        'submissions',
        { dueAt: 9_000 },
        undefined,
        { accessMode: 'assessment', periodAccess: PERIODS }
      );
    });

    expect(setDoc).not.toHaveBeenCalled();
    expect(batchCommit).toHaveBeenCalledTimes(1);
    const writes = Object.fromEntries(
      batchSet.mock.calls.map(([ref, data]) => [(ref as Ref).path, data])
    ) as Record<string, Record<string, unknown>>;
    const session = writes['guided_learning_sessions/sess-1'];
    expect(session).toMatchObject({
      publicSteps: [],
      imageUrls: [],
      stepsInContent: true,
      accessMode: 'assessment',
      periodAccess: PERIODS,
      dueAt: 9_000,
    });
    expect(session).not.toHaveProperty('imageKinds');
    expect(session).not.toHaveProperty('openAt');
    const content = writes['guided_learning_sessions/sess-1/content/steps'];
    expect(content).toMatchObject({
      imageUrls: ['https://img/1.png', 'https://img/2.mp4'],
      imageKinds: ['image', 'video'],
    });
    expect((content.publicSteps as { id: string }[]).map((s) => s.id)).toEqual([
      's1',
    ]);
    expect(JSON.stringify(content)).not.toContain('correctAnswer');
  });

  it('keeps a legacy session on one setDoc with its steps inline', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionTeacher('teacher-1')
    );
    await act(async () => {
      await result.current.createSession(set(), ['A'], ['P1'], ['r1']);
    });

    expect(writeBatch).not.toHaveBeenCalled();
    const written = (setDoc as Mock).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect((written.publicSteps as unknown[]).length).toBe(1);
    expect(written.imageKinds).toEqual(['image', 'video']);
    expect(written).not.toHaveProperty('stepsInContent');
    expect(written).not.toHaveProperty('periodAccess');
  });
});

const perPeriodSession = (
  over: Partial<GuidedLearningSession> = {}
): GuidedLearningSession =>
  ({
    id: 'sess-1',
    title: 'Cells',
    mode: 'guided',
    imageUrls: [],
    publicSteps: [],
    teacherUid: 't1',
    createdAt: 1,
    stepsInContent: true,
    accessMode: 'assignment',
    periodAccess: PERIODS,
    ...over,
  }) as GuidedLearningSession;

function emitSession(s: GuidedLearningSession) {
  act(() =>
    snapCbs['guided_learning_sessions/sess-1'].next({
      exists: () => true,
      data: () => s,
    })
  );
}

const contentPath = 'guided_learning_sessions/sess-1/content/steps';
const contentSubscriptions = () =>
  subscriptions.filter((p) => p === contentPath).length;

describe('useGuidedLearningSessionStudent — per-period gate', () => {
  it('stays pending with no steps until the content doc arrives, then merges it', () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('sess-1', 'stu-1')
    );
    emitSession(perPeriodSession());
    expect(result.current.contentPending).toBe(true);
    expect(result.current.session?.publicSteps).toEqual([]);

    act(() =>
      snapCbs[contentPath].next({
        exists: () => true,
        data: () => ({
          publicSteps: [{ id: 's1', imageIndex: 4 }],
          imageUrls: ['https://img/1.png', 'https://img/2.png'],
        }),
      })
    );
    expect(result.current.contentPending).toBe(false);
    expect(result.current.session?.imageUrls).toHaveLength(2);
    // Step indexes clamp against the merged slide list.
    expect(result.current.session?.publicSteps[0]).toMatchObject({
      id: 's1',
      imageIndex: 1,
    });
  });

  it('seats a signed-in student in their open class and retries the content read', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('sess-1', 'stu-1')
    );
    emitSession(perPeriodSession());
    act(() => snapCbs[contentPath].err({ code: 'permission-denied' }));
    const before = contentSubscriptions();

    let seated = false;
    await act(async () => {
      seated = await result.current.takeSeat(null, ['A', 'B']);
    });

    expect(seated).toBe(true);
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'guided_learning_sessions/sess-1/seats/stu-1' },
      { classId: 'B' }
    );
    expect(result.current.periodKeys).toEqual(['B']);
    expect(contentSubscriptions()).toBe(before + 1);
  });

  it('seats an anonymous joiner by the period they picked', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('sess-1', 'anon-1')
    );
    emitSession(perPeriodSession());
    await act(async () => {
      await result.current.takeSeat('P1', []);
    });
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'guided_learning_sessions/sess-1/seats/anon-1' },
      { classId: 'A' }
    );
  });

  it('refuses a student in none of the targeted classes', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('sess-1', 'stu-1')
    );
    emitSession(perPeriodSession());
    let seated = true;
    await act(async () => {
      seated = await result.current.takeSeat(null, ['Z']);
    });
    expect(seated).toBe(false);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('retries a denied content read when the student is let in', () => {
    renderHook(() => useGuidedLearningSessionStudent('sess-1', 'stu-1'));
    emitSession(perPeriodSession());
    act(() => snapCbs[contentPath].err({ code: 'permission-denied' }));
    const before = contentSubscriptions();
    emitSession(perPeriodSession({ studentAccess: { 'stu-1': 99_999 } }));
    expect(contentSubscriptions()).toBe(before + 1);
  });

  it('never reads a content doc on a legacy session', () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionStudent('sess-1', 'stu-1')
    );
    emitSession(
      perPeriodSession({
        stepsInContent: undefined,
        periodAccess: undefined,
        accessMode: undefined,
        publicSteps: [{ id: 's1' } as GuidedLearningSession['publicSteps'][0]],
      })
    );
    expect(contentSubscriptions()).toBe(0);
    expect(result.current.contentPending).toBe(false);
    expect(result.current.session?.publicSteps).toHaveLength(1);
  });
});
