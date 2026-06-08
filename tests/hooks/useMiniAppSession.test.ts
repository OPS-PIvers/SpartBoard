import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useMiniAppSessionTeacher } from '@/hooks/useMiniAppSession';
import type { MiniAppItem, MiniAppSession } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: { field, op, value },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockSetDoc = setDoc as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockOrderBy = orderBy as Mock;
const mockWhere = where as Mock;

const APP_ID = 'app-1';
const TEACHER_UID = 'teacher-1';

const baseApp = (overrides: Partial<MiniAppItem> = {}): MiniAppItem => ({
  id: APP_ID,
  title: 'Fraction Game',
  html: '<html>app</html>',
  createdAt: 100,
  ...overrides,
});

// useMiniAppSessionTeacher reads `snap.docs.map(...)`, so the fake snapshot
// exposes a `docs` array whose entries carry an `id` and a `data()` getter.
const fakeSnap = (
  docs: Array<{ id: string; data: Record<string, unknown> }>
) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockReturnValue(() => undefined);
});

describe('useMiniAppSessionTeacher — createSession', () => {
  it('writes the full session payload to the sessionId doc path and returns the id', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-4111-8111-111111111111'
    );
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const { result } = renderHook(() => useMiniAppSessionTeacher());

    let returned = '';
    await act(async () => {
      returned = await result.current.createSession(
        baseApp(),
        TEACHER_UID,
        'My Assignment'
      );
    });

    expect(returned).toBe('11111111-1111-4111-8111-111111111111');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockSetDoc.mock.calls[0] ?? [];
    expect(path).toBe('mini_app_sessions/11111111-1111-4111-8111-111111111111');
    expect(payload).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      appId: APP_ID,
      appTitle: 'Fraction Game',
      appHtml: '<html>app</html>',
      teacherUid: TEACHER_UID,
      assignmentName: 'My Assignment',
      status: 'active',
      createdAt: 1700000000000,
      submissionsEnabled: true,
      mode: 'submissions',
    });
  });

  it('trims the assignment name', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    await act(async () => {
      await result.current.createSession(
        baseApp(),
        TEACHER_UID,
        '  Padded Name  '
      );
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as MiniAppSession;
    expect(payload.assignmentName).toBe('Padded Name');
  });

  it('falls back to a generated assignment name when the name is blank', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    await act(async () => {
      await result.current.createSession(
        baseApp({ title: 'Quiz Maker' }),
        TEACHER_UID,
        '   '
      );
    });

    // The fallback name uses `new Date().toLocaleString()` (live clock), so we
    // only assert the title-prefixed shape rather than an exact timestamp.
    const payload = mockSetDoc.mock.calls[0]?.[1] as MiniAppSession;
    expect(payload.assignmentName).toMatch(/^Quiz Maker — /);
  });

  it('defaults mode to submissions and derives submissionsEnabled=true', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    await act(async () => {
      await result.current.createSession(baseApp(), TEACHER_UID, 'A');
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as MiniAppSession;
    expect(payload.mode).toBe('submissions');
    expect(payload.submissionsEnabled).toBe(true);
  });

  it('derives submissionsEnabled=false for view-only mode', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    await act(async () => {
      await result.current.createSession(baseApp(), TEACHER_UID, 'A', {
        mode: 'view-only',
      });
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as MiniAppSession;
    expect(payload.mode).toBe('view-only');
    expect(payload.submissionsEnabled).toBe(false);
  });

  it('includes cleaned classIds and rosterIds when present, dropping empty/non-string entries', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    await act(async () => {
      await result.current.createSession(baseApp(), TEACHER_UID, 'A', {
        classIds: ['c1', '', 'c2'],
        rosterIds: ['r1', ''],
      });
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as MiniAppSession;
    expect(payload.classIds).toEqual(['c1', 'c2']);
    expect(payload.rosterIds).toEqual(['r1']);
  });

  it('omits classIds and rosterIds entirely when none survive cleaning', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    await act(async () => {
      await result.current.createSession(baseApp(), TEACHER_UID, 'A', {
        classIds: ['', ''],
        rosterIds: [],
      });
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect('classIds' in payload).toBe(false);
    expect('rosterIds' in payload).toBe(false);
  });
});

describe('useMiniAppSessionTeacher — subscribeToAppSessions', () => {
  it('sets loading and wires the query with appId/teacherUid filters ordered by createdAt desc', () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    act(() => {
      result.current.subscribeToAppSessions(APP_ID, TEACHER_UID);
    });

    expect(result.current.sessionsLoading).toBe(true);
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'mini_app_sessions'
    );
    expect(mockWhere).toHaveBeenCalledWith('appId', '==', APP_ID);
    expect(mockWhere).toHaveBeenCalledWith('teacherUid', '==', TEACHER_UID);
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('maps snapshot docs through normalizeSession and clears loading', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    act(() => {
      result.current.subscribeToAppSessions(APP_ID, TEACHER_UID);
    });
    act(() => {
      cb(
        fakeSnap([
          {
            id: 'sess-a',
            data: {
              appId: APP_ID,
              appTitle: 'Full App',
              appHtml: '<x/>',
              teacherUid: TEACHER_UID,
              assignmentName: 'Named',
              status: 'active',
              createdAt: 5,
            },
          },
        ])
      );
    });

    expect(result.current.sessionsLoading).toBe(false);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]).toMatchObject({
      id: 'sess-a',
      appId: APP_ID,
      appTitle: 'Full App',
      assignmentName: 'Named',
      status: 'active',
      createdAt: 5,
    });
  });

  it('logs, clears sessions, and clears loading on listener error', () => {
    let errCb: ((e: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      errCb = onError;
      return () => undefined;
    });
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    act(() => {
      result.current.subscribeToAppSessions(APP_ID, TEACHER_UID);
    });
    act(() => {
      errCb?.(new Error('boom'));
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.sessionsLoading).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[useMiniAppSessionTeacher] Session list error:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('tears down a previous listener when re-subscribing', () => {
    const firstUnsub = vi.fn();
    const secondUnsub = vi.fn();
    mockOnSnapshot
      .mockReturnValueOnce(firstUnsub)
      .mockReturnValueOnce(secondUnsub);
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    act(() => {
      result.current.subscribeToAppSessions(APP_ID, TEACHER_UID);
    });
    act(() => {
      result.current.subscribeToAppSessions('app-2', TEACHER_UID);
    });

    expect(firstUnsub).toHaveBeenCalledTimes(1);
    expect(secondUnsub).not.toHaveBeenCalled();
  });
});

describe('useMiniAppSessionTeacher — normalizeSession via snapshot', () => {
  const renderSubscribed = () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const hook = renderHook(() => useMiniAppSessionTeacher());
    act(() => {
      hook.result.current.subscribeToAppSessions(APP_ID, TEACHER_UID);
    });
    return { ...hook, emit: (snap: unknown) => act(() => cb(snap)) };
  };

  it('applies defaults for a sparse doc and derives the fallback assignment name', () => {
    const { result, emit } = renderSubscribed();
    const createdAt = 1700000000000;

    emit(fakeSnap([{ id: 'sparse', data: { createdAt } }]));

    const s = result.current.sessions[0];
    expect(s).toEqual({
      id: 'sparse',
      appId: '',
      appTitle: 'Mini App',
      appHtml: '',
      teacherUid: '',
      assignmentName: `Mini App — ${new Date(createdAt).toLocaleString()}`,
      status: 'active',
      createdAt,
    });
  });

  it('coerces an unknown status to active and preserves ended', () => {
    const { result, emit } = renderSubscribed();

    emit(
      fakeSnap([
        { id: 'weird', data: { status: 'paused' } },
        { id: 'done', data: { status: 'ended', endedAt: 42 } },
      ])
    );

    const byId = Object.fromEntries(
      result.current.sessions.map((s) => [s.id, s])
    );
    expect(byId.weird?.status).toBe('active');
    expect(byId.done?.status).toBe('ended');
    expect(byId.done?.endedAt).toBe(42);
  });

  it('includes endedAt only when it is a number', () => {
    const { result, emit } = renderSubscribed();

    emit(
      fakeSnap([
        { id: 'num', data: { endedAt: 7 } },
        { id: 'str', data: { endedAt: 'nope' } },
        { id: 'absent', data: {} },
      ])
    );

    const byId = Object.fromEntries(
      result.current.sessions.map((s) => [s.id, s])
    );
    expect(byId.num?.endedAt).toBe(7);
    expect('endedAt' in (byId.str ?? {})).toBe(false);
    expect('endedAt' in (byId.absent ?? {})).toBe(false);
  });

  it('filters classIds/rosterIds and omits them when empty', () => {
    const { result, emit } = renderSubscribed();

    emit(
      fakeSnap([
        {
          id: 'withlists',
          data: { classIds: ['c1', '', 2], rosterIds: ['r1'] },
        },
        { id: 'emptylists', data: { classIds: [''], rosterIds: [] } },
        { id: 'notarray', data: { classIds: 'c1' } },
      ])
    );

    const byId = Object.fromEntries(
      result.current.sessions.map((s) => [s.id, s])
    );
    expect(byId.withlists?.classIds).toEqual(['c1']);
    expect(byId.withlists?.rosterIds).toEqual(['r1']);
    expect('classIds' in (byId.emptylists ?? {})).toBe(false);
    expect('rosterIds' in (byId.emptylists ?? {})).toBe(false);
    expect('classIds' in (byId.notarray ?? {})).toBe(false);
  });

  it('includes submissionsEnabled only when strictly true and mode only when valid', () => {
    const { result, emit } = renderSubscribed();

    emit(
      fakeSnap([
        {
          id: 'on',
          data: { submissionsEnabled: true, mode: 'submissions' },
        },
        {
          id: 'off',
          data: { submissionsEnabled: false, mode: 'view-only' },
        },
        { id: 'bad', data: { submissionsEnabled: 'yes', mode: 'bogus' } },
      ])
    );

    const byId = Object.fromEntries(
      result.current.sessions.map((s) => [s.id, s])
    );
    expect(byId.on?.submissionsEnabled).toBe(true);
    expect(byId.on?.mode).toBe('submissions');
    expect('submissionsEnabled' in (byId.off ?? {})).toBe(false);
    expect(byId.off?.mode).toBe('view-only');
    expect('submissionsEnabled' in (byId.bad ?? {})).toBe(false);
    expect('mode' in (byId.bad ?? {})).toBe(false);
  });

  it('uses the Firestore doc id over any stale id in the data', () => {
    const { result, emit } = renderSubscribed();

    emit(fakeSnap([{ id: 'real-id', data: { id: 'stale-id' } }]));

    expect(result.current.sessions[0]?.id).toBe('real-id');
  });
});

describe('useMiniAppSessionTeacher — unsubscribeFromAppSessions', () => {
  it('tears down the active listener and resets state', () => {
    const unsub = vi.fn();
    mockOnSnapshot.mockReturnValue(unsub);
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return unsub;
    });
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    act(() => {
      result.current.subscribeToAppSessions(APP_ID, TEACHER_UID);
    });
    act(() => {
      cb(fakeSnap([{ id: 'sess-a', data: {} }]));
    });
    expect(result.current.sessions).toHaveLength(1);

    act(() => {
      result.current.unsubscribeFromAppSessions();
    });

    expect(unsub).toHaveBeenCalledTimes(1);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.sessionsLoading).toBe(false);
  });
});

describe('useMiniAppSessionTeacher — renameSession', () => {
  it('updates the session doc with a trimmed assignment name', async () => {
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    await act(async () => {
      await result.current.renameSession('sess-9', '  New Name  ');
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockUpdateDoc.mock.calls[0] ?? [];
    expect(path).toBe('mini_app_sessions/sess-9');
    expect(payload).toEqual({ assignmentName: 'New Name' });
  });
});

describe('useMiniAppSessionTeacher — endSession', () => {
  it('marks the session ended with an endedAt timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000123);
    const { result } = renderHook(() => useMiniAppSessionTeacher());

    await act(async () => {
      await result.current.endSession('sess-3');
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockUpdateDoc.mock.calls[0] ?? [];
    expect(path).toBe('mini_app_sessions/sess-3');
    expect(payload).toEqual({ status: 'ended', endedAt: 1700000000123 });
  });
});

describe('useMiniAppSessionTeacher — unmount cleanup', () => {
  it('unsubscribes the active listener when the hook unmounts', () => {
    const unsub = vi.fn();
    mockOnSnapshot.mockReturnValue(unsub);
    const { result, unmount } = renderHook(() => useMiniAppSessionTeacher());

    act(() => {
      result.current.subscribeToAppSessions(APP_ID, TEACHER_UID);
    });

    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
