import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  setDoc,
} from 'firebase/firestore';
import { useActivityWallLibrary } from '@/hooks/useActivityWallLibrary';
import type { ActivityWallLibraryEntry } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
  setDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockSetDoc = setDoc as Mock;
const mockDeleteDoc = deleteDoc as Mock;
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

  it('throws and does not write when there is no signed-in user', async () => {
    const { result } = renderHook(() => useActivityWallLibrary(undefined));

    await expect(result.current.saveActivity(baseEntry())).rejects.toThrow(
      'Not signed in'
    );
    expect(mockSetDoc).not.toHaveBeenCalled();
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
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | undefined }) => useActivityWallLibrary(uid),
      { initialProps: { uid: USER_UID as string | undefined } }
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
