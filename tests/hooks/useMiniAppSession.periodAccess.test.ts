// Per-period Mini-app sessions: the app moves to content/app in one batch with the
// session, and the teacher's archive row mirrors the gate for the hub.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { useMiniAppSessionTeacher } from '@/hooks/useMiniAppSession';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import type { MiniAppItem, PeriodAccess } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

const ID = '22222222-2222-4222-8222-222222222222';
const APP: MiniAppItem = {
  id: 'app-1',
  title: 'Fractions',
  html: '<html>secret app</html>',
  createdAt: 1,
};
const PERIODS: Record<string, PeriodAccess> = {
  A: {
    state: 'closed',
    openAt: null,
    closeAt: null,
    bellPeriodId: null,
    verified: true,
    label: 'P1',
  },
};
const batchSet = vi.fn();
const batchCommit = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (onSnapshot as Mock).mockReturnValue(() => undefined);
  (setDoc as Mock).mockResolvedValue(undefined);
  const batch = { set: batchSet, commit: batchCommit };
  batchSet.mockReturnValue(batch);
  batchCommit.mockResolvedValue(undefined);
  (writeBatch as Mock).mockReturnValue(batch);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(ID);
});

describe('useMiniAppSessionTeacher.createSession — per-period', () => {
  it('writes an empty app on the session and the app to content/app in one batch', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());
    await act(async () => {
      await result.current.createSession(APP, 'teacher-1', 'Fractions', {
        classIds: ['A', 'B'],
        assignmentId: 'asg-1',
        periodGate: { accessMode: 'assessment', periodAccess: PERIODS },
      });
    });
    expect(setDoc).not.toHaveBeenCalled();
    expect(batchSet).toHaveBeenCalledTimes(2);
    const [sessionRef, session] = batchSet.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(sessionRef).toBe(`mini_app_sessions/${ID}`);
    expect(session).toMatchObject({
      appHtml: '',
      appInContent: true,
      accessMode: 'assessment',
      periodAccess: PERIODS,
      assignmentId: 'asg-1',
    });
    expect(batchSet.mock.calls[1]).toEqual([
      `mini_app_sessions/${ID}/content/app`,
      { appHtml: APP.html },
    ]);
    expect(batchCommit).toHaveBeenCalledOnce();
  });

  it('keeps the app on a legacy session', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());
    await act(async () => {
      await result.current.createSession(APP, 'teacher-1', 'Fractions', {
        classIds: ['A'],
      });
    });
    expect(writeBatch).not.toHaveBeenCalled();
    const session = (setDoc as Mock).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(session.appHtml).toBe(APP.html);
    expect(session).not.toHaveProperty('appInContent');
    expect(session).not.toHaveProperty('periodAccess');
  });
});

describe('useMiniAppAssignments.createAssignment — per-period', () => {
  it('mirrors the gate onto the archive row', async () => {
    const { result } = renderHook(() => useMiniAppAssignments('teacher-1'));
    await act(async () => {
      await result.current.createAssignment({
        id: 'asg-1',
        sessionId: ID,
        app: APP,
        assignmentName: 'Fractions',
        periodGate: { accessMode: 'assessment', periodAccess: PERIODS },
      });
    });
    const [ref, row] = (setDoc as Mock).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(ref).toBe('users/teacher-1/miniapp_assignments/asg-1');
    expect(row).toMatchObject({
      accessMode: 'assessment',
      periodAccess: PERIODS,
    });
    expect(row).not.toHaveProperty('openAt');
  });
});
