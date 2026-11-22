import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { clearWallSubmissions } from '@/components/widgets/ActivityWall/hooks/useActivityWallSession';
import { endTourSandbox, startTourSandbox } from '@/utils/tourSandbox';
import { useActivityWallLibrary } from '@/hooks/useActivityWallLibrary';
import type { ActivityWallLibraryEntry } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock(
  '@/components/widgets/ActivityWall/hooks/useActivityWallSession',
  () => ({
    clearWallSubmissions: vi.fn(() => Promise.resolve()),
  })
);

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockSetDoc = setDoc as Mock;
const mockDeleteDoc = deleteDoc as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockGetDoc = getDoc as Mock;
const mockClear = clearWallSubmissions as Mock;
const mockOrderBy = orderBy as Mock;

const USER_UID = 'user-1';

const baseEntry = (
  overrides: Partial<ActivityWallLibraryEntry> = {}
): ActivityWallLibraryEntry => ({
  id: 'act-1',
  title: 'Warm Up',
  prompt: 'Share one thing you learned today.',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  createdAt: 100,
  updatedAt: 200,
  ...overrides,
});

// useActivityWallLibrary reads `snap.docs.map(...)`, so the fake snapshot
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
  mockDeleteDoc.mockResolvedValue(undefined);
  mockGetDoc.mockResolvedValue({ data: () => ({ acceptingResponses: true }) });
});

describe('useActivityWallLibrary — listener wiring', () => {
  it('orders by updatedAt desc and targets the per-user collection', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => useActivityWallLibrary(USER_UID));

    expect(mockOrderBy).toHaveBeenCalledWith('updatedAt', 'desc');
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'users',
      USER_UID,
      'activity_wall_activities'
    );
  });

  it('skips the listener and is not loading when userId is undefined', () => {
    const { result } = renderHook(() => useActivityWallLibrary(undefined));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.activities).toEqual([]);
  });

  it('starts in a loading state while a userId is present', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));
    expect(result.current.loading).toBe(true);
  });
});

describe('useActivityWallLibrary — snapshot mapping', () => {
  it('maps documents, applies defaults for missing fields, and clears loading', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'doc-a',
            data: {
              id: 'act-a',
              title: 'Full',
              prompt: 'p',
              mode: 'photo',
              moderationEnabled: true,
              identificationMode: 'name',
              createdAt: 1,
              updatedAt: 2,
            },
          },
          {
            // Sparse doc — every field falls back to its default.
            id: 'doc-b',
            data: {},
          },
        ])
      );
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.activities).toHaveLength(2);

    const [a, b] = result.current.activities;
    expect(a).toEqual({
      id: 'act-a',
      title: 'Full',
      prompt: 'p',
      mode: 'photo',
      moderationEnabled: true,
      identificationMode: 'name',
      createdAt: 1,
      updatedAt: 2,
      layout: 'wall',
      allowedTypes: { photo: true, link: false, file: false, video: false },
      appearance: {
        kind: 'gradient',
        value: 'bg-gradient-to-br from-slate-900 to-slate-700',
      },
      allowGuests: true,
      showNames: true,
      maxPostsPerStudent: 0,
      allowStudentEdit: false,
      allowStudentDelete: false,
      acceptingResponses: true,
    });
    // Falls back to the Firestore doc id, empty strings, and 'text'/'anonymous'.
    expect(b).toEqual({
      id: 'doc-b',
      title: '',
      prompt: '',
      mode: 'text',
      moderationEnabled: false,
      identificationMode: 'anonymous',
      createdAt: 0,
      updatedAt: 0,
      layout: 'wordcloud',
      allowedTypes: { photo: false, link: false, file: false, video: false },
      appearance: {
        kind: 'gradient',
        value: 'bg-gradient-to-br from-slate-900 to-slate-700',
      },
      allowGuests: true,
      showNames: false,
      maxPostsPerStudent: 0,
      allowStudentEdit: false,
      allowStudentDelete: false,
      acceptingResponses: true,
    });
  });

  it('includes classId only when it is a non-empty string', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    act(() => {
      cb(
        fakeSnap([
          { id: 'with', data: { classId: 'class-9' } },
          { id: 'empty', data: { classId: '' } },
          { id: 'absent', data: {} },
        ])
      );
    });

    const byId = Object.fromEntries(
      result.current.activities.map((e) => [e.id, e])
    );
    expect(byId.with?.classId).toBe('class-9');
    expect('classId' in (byId.empty ?? {})).toBe(false);
    expect('classId' in (byId.absent ?? {})).toBe(false);
  });

  it('preserves classIds (Phase 5A) when present in the Firestore doc', () => {
    // Regression: the old hand-enumerated literal dropped classIds silently.
    // Each onSnapshot refresh would strip classIds from the in-memory state,
    // and a subsequent saveActivity call would permanently delete it from
    // Firestore. Students would no longer see the activity on /my-assignments.
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    act(() => {
      cb(
        fakeSnap([
          {
            id: 'act-multi',
            data: {
              title: 'Multi-class activity',
              prompt: 'Respond here',
              mode: 'text',
              moderationEnabled: false,
              identificationMode: 'anonymous',
              createdAt: 1,
              updatedAt: 2,
              classIds: ['class-a', 'class-b'],
              rosterIds: ['roster-1'],
            },
          },
        ])
      );
    });

    const entry = result.current.activities[0];
    expect(entry?.classIds).toEqual(['class-a', 'class-b']);
    expect(entry?.rosterIds).toEqual(['roster-1']);
  });

  it('surfaces an error message and clears loading on listener failure', () => {
    let errCb: ((e: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      errCb = onError;
      return () => undefined;
    });
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    act(() => {
      errCb?.(new Error('boom'));
    });

    expect(result.current.error).toBe('Failed to load activities');
    expect(result.current.loading).toBe(false);
    consoleSpy.mockRestore();
  });
});

describe('useActivityWallLibrary — saveActivity', () => {
  it('writes the full payload to the entry-id document path', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    const entry = baseEntry();
    await act(async () => {
      await result.current.saveActivity(entry);
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockSetDoc.mock.calls[0] ?? [];
    expect(path).toBe(`users/${USER_UID}/activity_wall_activities/${entry.id}`);
    expect(payload).toEqual({
      id: entry.id,
      title: entry.title,
      prompt: entry.prompt,
      mode: entry.mode,
      moderationEnabled: entry.moderationEnabled,
      identificationMode: entry.identificationMode,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  });

  it('includes classId in the payload when present', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await result.current.saveActivity(baseEntry({ classId: 'class-5' }));
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.classId).toBe('class-5');
  });

  it('strips an empty-string classId so the student class gate rule is not broken', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await result.current.saveActivity(baseEntry({ classId: '' }));
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect('classId' in payload).toBe(false);
  });

  it('includes classIds in the payload when present (Phase 5A regression)', async () => {
    // Regression: the old hand-enumerated payload silently dropped classIds,
    // so a saveActivity call after a snapshot refresh would permanently delete
    // the multi-class targeting from Firestore.
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await result.current.saveActivity(
        baseEntry({ classIds: ['class-a', 'class-b'], rosterIds: ['roster-1'] })
      );
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.classIds).toEqual(['class-a', 'class-b']);
    expect(payload.rosterIds).toEqual(['roster-1']);
  });

  it('throws and does not write when there is no signed-in user', async () => {
    const { result } = renderHook(() => useActivityWallLibrary(undefined));

    await expect(result.current.saveActivity(baseEntry())).rejects.toThrow(
      'Not signed in'
    );
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe('useActivityWallLibrary — clearActivityPosts', () => {
  const sessionPath = `activity_wall_sessions/${USER_UID}_act-7`;

  it('closes, clears, then reopens the wall without deleting it', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await result.current.clearActivityPosts('act-7');
    });

    expect(mockUpdateDoc.mock.calls).toEqual([
      [sessionPath, { acceptingResponses: false }],
      [sessionPath, { acceptingResponses: true }],
    ]);
    expect(mockClear).toHaveBeenCalledWith(`${USER_UID}_act-7`);
    expect(mockDeleteDoc).not.toHaveBeenCalled();
    const [close, clear, reopen] = [
      mockUpdateDoc.mock.invocationCallOrder[0],
      mockClear.mock.invocationCallOrder[0],
      mockUpdateDoc.mock.invocationCallOrder[1],
    ];
    expect(close).toBeLessThan(clear);
    expect(clear).toBeLessThan(reopen);
  });

  it('leaves a wall that was already closed closed', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    mockGetDoc.mockResolvedValueOnce({
      data: () => ({ acceptingResponses: false }),
    });
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await result.current.clearActivityPosts('act-7');
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('reopens the wall when clearing fails', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    mockClear.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await expect(result.current.clearActivityPosts('act-7')).rejects.toThrow(
        'boom'
      );
    });

    expect(mockUpdateDoc).toHaveBeenLastCalledWith(sessionPath, {
      acceptingResponses: true,
    });
  });

  it('aborts without clearing when the close fails', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const denied = Object.assign(new Error('denied'), {
      code: 'permission-denied',
    });
    mockUpdateDoc.mockRejectedValueOnce(denied);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await expect(result.current.clearActivityPosts('act-7')).rejects.toBe(
        denied
      );
    });

    expect(mockClear).not.toHaveBeenCalled();
  });

  it('does not touch the real session during a tour sandbox', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    startTourSandbox();
    try {
      const { result } = renderHook(() => useActivityWallLibrary(USER_UID));
      await act(async () => {
        await result.current.clearActivityPosts('act-7');
      });
    } finally {
      endTourSandbox();
    }

    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });
});

describe('useActivityWallLibrary — deleteActivity', () => {
  it('deletes the document at the activity-id path', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await result.current.deleteActivity('act-7');
    });

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc.mock.calls[0]?.[0]).toBe(
      `users/${USER_UID}/activity_wall_activities/act-7`
    );
  });

  it('closes the session, clears posts, then deletes the wall', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await result.current.deleteActivity('act-7');
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      `activity_wall_sessions/${USER_UID}_act-7`,
      { acceptingResponses: false }
    );
    expect(mockClear).toHaveBeenCalledWith(`${USER_UID}_act-7`);
    const order = [
      mockUpdateDoc.mock.invocationCallOrder[0],
      mockClear.mock.invocationCallOrder[0],
      mockDeleteDoc.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it('carries on when the session doc does not exist', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    mockUpdateDoc.mockRejectedValueOnce({ code: 'not-found' });
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await result.current.deleteActivity('act-7');
    });

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });

  it('aborts without clearing or deleting when the close fails', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const denied = Object.assign(new Error('denied'), {
      code: 'permission-denied',
    });
    mockUpdateDoc.mockRejectedValueOnce(denied);
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await expect(result.current.deleteActivity('act-7')).rejects.toBe(denied);
    });

    expect(mockClear).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('reopens the session when clearing fails after the close', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    mockClear.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useActivityWallLibrary(USER_UID));

    await act(async () => {
      await expect(result.current.deleteActivity('act-7')).rejects.toThrow(
        'boom'
      );
    });

    expect(mockDeleteDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      `activity_wall_sessions/${USER_UID}_act-7`,
      { acceptingResponses: true }
    );
  });

  it('does not touch the real session during a tour sandbox', async () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    startTourSandbox();
    try {
      const { result } = renderHook(() => useActivityWallLibrary(USER_UID));
      await act(async () => {
        await result.current.deleteActivity('act-7');
      });
    } finally {
      endTourSandbox();
    }

    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('throws and does not delete when there is no signed-in user', async () => {
    const { result } = renderHook(() => useActivityWallLibrary(undefined));

    await expect(result.current.deleteActivity('act-7')).rejects.toThrow(
      'Not signed in'
    );
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });
});

describe('useActivityWallLibrary — userId transitions', () => {
  it('clears activities and loading when the user signs out', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const userProps: { uid: string | undefined } = { uid: USER_UID };
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | undefined }) => useActivityWallLibrary(uid),
      { initialProps: userProps }
    );

    act(() => {
      cb(fakeSnap([{ id: 'doc-a', data: { title: 'Keep' } }]));
    });
    expect(result.current.activities).toHaveLength(1);

    rerender({ uid: undefined });

    expect(result.current.activities).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
