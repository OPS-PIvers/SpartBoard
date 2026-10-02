import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as Y from 'yjs';
import { encodeDocSnapshot, seedNoteDoc } from '@/utils/plcNoteCrdt';

const getDocMock = vi.fn<(ref: unknown) => Promise<unknown>>();
const updateDocMock =
  vi.fn<(ref: unknown, fields: Record<string, unknown>) => Promise<void>>();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'plcs/p1/notes/n1' })),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDoc: (ref: unknown) => getDocMock(ref),
  updateDoc: (ref: unknown, fields: Record<string, unknown>) =>
    updateDocMock(ref, fields),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(),
  onSnapshot: (_q: unknown, next: (snap: unknown) => void) => {
    next({ size: 0, docs: [], docChanges: () => [] });
    return () => undefined;
  },
  runTransaction: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => 'SERVER_TS',
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));

const { usePlcNoteCrdt } = await import('@/hooks/usePlcNoteCrdt');

const noteDoc = (fields: { title: string; body: string }, yState: string) => ({
  exists: () => true,
  data: () => ({ ...fields, version: 3, yState }),
});

const stateFor = (title: string, body: string) => {
  const d = new Y.Doc();
  seedNoteDoc(d, { title, body, actionItems: [] });
  return encodeDocSnapshot(d);
};

const open = async () => {
  const hook = renderHook(() =>
    usePlcNoteCrdt({ plcId: 'p1', noteId: 'n1', enabled: true })
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(2500);
    await Promise.resolve();
    await Promise.resolve();
  });
  return hook;
};

describe('usePlcNoteCrdt mirror repair', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getDocMock.mockReset();
    updateDocMock.mockReset();
    updateDocMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rewrites a title and body the last session never mirrored', async () => {
    getDocMock.mockResolvedValue(
      noteDoc(
        { title: '', body: '' },
        stateFor('Tech Tips Planning', 'Once a week')
      )
    );
    const { result } = await open();

    expect(result.current.content.title).toBe('Tech Tips Planning');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({
      title: 'Tech Tips Planning',
      body: 'Once a week',
      version: 4,
    });
  });

  it('writes nothing when the mirror already matches', async () => {
    getDocMock.mockResolvedValue(
      noteDoc({ title: 'Plan', body: 'Body' }, stateFor('Plan', 'Body'))
    );
    await open();

    expect(updateDocMock).not.toHaveBeenCalled();
  });
});
