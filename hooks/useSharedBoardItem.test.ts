import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  arrayUnion: vi.fn((...items: unknown[]) => ({ arrayUnion: items })),
  onSnapshot: vi.fn(),
  doc: vi.fn((...parts: unknown[]) => ({ path: parts.slice(1).join('/') })),
}));
vi.mock('firebase/firestore', () => fs);
vi.mock('@/config/firebase', () => ({ db: {} }));

const store = { shareId: 'share-1' as string | null };

const auth = vi.hoisted(() => ({ uid: 'me' }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: auth.uid } }),
}));

import React from 'react';
import { BoardLinkedShareContext } from '@/context/boardLinkedShare';
import {
  resetSharedBoardItemPublishes,
  useSharedBoardItem,
  useSharedBoardItemPublisher,
} from './useSharedBoardItem';
import { publishSharedBoardItem } from '@/utils/sharedBoardItems';

const noop = () => undefined;
const flush = () => Promise.resolve();

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    BoardLinkedShareContext.Provider,
    { value: store.shareId },
    children
  );

const snap = (data: unknown) => ({
  exists: () => data !== null,
  data: () => data,
});

const ITEM = 'shared_boards/share-1/items/quiz_me_q1';
const PICKS = 'users/me/board_item_picks/share-1';
// Docs by path; the owner picked q1 on share-1 unless a test says otherwise.
let stored: Record<string, unknown> = {};
const storeCopy = (data: unknown) => {
  stored[ITEM] = data;
};

beforeEach(() => {
  vi.clearAllMocks();
  stored = { [PICKS]: { items: ['quiz_q1'] } };
  fs.getDoc.mockImplementation((ref: { path: string }) =>
    Promise.resolve(snap(stored[ref.path] ?? null))
  );
  store.shareId = 'share-1';
  auth.uid = 'me';
  resetSharedBoardItemPublishes();
});

describe('useSharedBoardItem', () => {
  it('is off without a live share or an item', () => {
    store.shareId = null;
    expect(
      renderHook(() => useSharedBoardItem('quiz', 'host', 'q1'), { wrapper })
        .result.current.status
    ).toBe('off');
    store.shareId = 'share-1';
    expect(
      renderHook(() => useSharedBoardItem('quiz', 'host', null), { wrapper })
        .result.current.status
    ).toBe('off');
    expect(fs.onSnapshot).not.toHaveBeenCalled();
  });

  it('is pending until the snapshot answers, then foreign for a colleague copy', () => {
    let emit: (s: unknown) => void = noop;
    fs.onSnapshot.mockImplementation(
      (_ref: unknown, next: (s: unknown) => void) => {
        emit = next;
        return noop;
      }
    );
    const { result } = renderHook(
      () => useSharedBoardItem('quiz', 'host', 'q1'),
      {
        wrapper,
      }
    );
    expect(result.current.status).toBe('pending');
    expect(fs.doc).toHaveBeenCalledWith(
      {},
      'shared_boards',
      'share-1',
      'items',
      'quiz_host_q1'
    );
    act(() =>
      emit(snap({ kind: 'quiz', itemId: 'q1', ownerUid: 'host', payload: {} }))
    );
    expect(result.current.status).toBe('foreign');
    expect(result.current.item?.ownerUid).toBe('host');
  });

  it('is off for the viewer’s own item', () => {
    expect(
      renderHook(() => useSharedBoardItem('quiz', 'me', 'q1'), { wrapper })
        .result.current.status
    ).toBe('off');
    expect(fs.onSnapshot).not.toHaveBeenCalled();
  });

  it('is none for a copy under another owner, a missing copy, or a denied read', () => {
    let emit: (s: unknown) => void = noop;
    let fail: (e: unknown) => void = noop;
    fs.onSnapshot.mockImplementation(
      (
        _ref: unknown,
        next: (s: unknown) => void,
        error: (e: unknown) => void
      ) => {
        emit = next;
        fail = error;
        return noop;
      }
    );
    const { result } = renderHook(
      () => useSharedBoardItem('quiz', 'host', 'q1'),
      {
        wrapper,
      }
    );
    act(() =>
      emit(snap({ kind: 'quiz', itemId: 'q1', ownerUid: 'other', payload: {} }))
    );
    expect(result.current.status).toBe('none');
    act(() => emit(snap(null)));
    expect(result.current.status).toBe('none');
    act(() => fail({ code: 'permission-denied' }));
    expect(result.current.status).toBe('none');
  });
});

describe('publishSharedBoardItem', () => {
  const item = {
    kind: 'quiz' as const,
    itemId: 'q1',
    ownerUid: 'me',
    title: 'Q',
    version: '5',
  };

  it('writes when nothing is there', async () => {
    const build = vi.fn(() => Promise.resolve({ a: 1 }));
    await expect(publishSharedBoardItem('share-1', item, build)).resolves.toBe(
      'written'
    );
    expect(fs.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ...item, payload: { a: 1 } })
    );
  });

  it('skips the same version and never builds', async () => {
    storeCopy({ ownerUid: 'me', version: '5' });
    const build = vi.fn();
    await expect(publishSharedBoardItem('share-1', item, build)).resolves.toBe(
      'current'
    );
    expect(build).not.toHaveBeenCalled();
    expect(fs.setDoc).not.toHaveBeenCalled();
  });
});

describe('publishSharedBoardItem picks', () => {
  const item = {
    kind: 'quiz' as const,
    itemId: 'q1',
    ownerUid: 'me',
    title: 'Q',
    version: '5',
  };

  it('never writes a first copy of an item the owner did not pick on this board', async () => {
    stored = { 'users/me/board_item_picks/share-2': { items: ['quiz_q1'] } };
    const build = vi.fn();
    await expect(publishSharedBoardItem('share-1', item, build)).resolves.toBe(
      'unpicked'
    );
    stored[PICKS] = { items: ['flashcards_q1', 'quiz_q2'] };
    await expect(publishSharedBoardItem('share-1', item, build)).resolves.toBe(
      'unpicked'
    );
    expect(build).not.toHaveBeenCalled();
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('seeds a share made before picks existed from the board, then publishes', async () => {
    stored = {
      'shared_boards/share-1': {
        widgets: [{ type: 'quiz', config: { selectedQuizId: 'q1' } }],
      },
    };
    fs.setDoc.mockImplementation((ref: { path: string }) => {
      if (ref.path === PICKS) stored[PICKS] = { items: ['quiz_q1'] };
      return Promise.resolve();
    });
    await expect(
      publishSharedBoardItem('share-1', item, () => Promise.resolve({ a: 1 }))
    ).resolves.toBe('written');
    expect(fs.setDoc).toHaveBeenCalledWith(
      { path: PICKS },
      { items: { arrayUnion: ['quiz_q1'] } },
      { merge: true }
    );
    expect(fs.setDoc).toHaveBeenLastCalledWith(
      { path: ITEM },
      expect.objectContaining({ itemId: 'q1', payload: { a: 1 } })
    );
  });

  it('never seeds a picks doc that exists, even an empty one', async () => {
    stored = {
      [PICKS]: { items: [] },
      'shared_boards/share-1': {
        widgets: [{ type: 'quiz', config: { selectedQuizId: 'q1' } }],
      },
    };
    const build = vi.fn();
    await expect(publishSharedBoardItem('share-1', item, build)).resolves.toBe(
      'unpicked'
    );
    expect(build).not.toHaveBeenCalled();
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('keeps a copy published before picks existed current', async () => {
    stored = {};
    storeCopy({ ownerUid: 'me', version: '4' });
    await expect(
      publishSharedBoardItem('share-1', item, () => Promise.resolve({ a: 1 }))
    ).resolves.toBe('written');
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
  });
});

describe('useSharedBoardItemPublisher', () => {
  const args = (version: string | null) => ({
    kind: 'quiz' as const,
    itemId: 'q1',
    title: 'Q',
    version,
    build: () => Promise.resolve({ a: 1 }),
    stampedOwnerUid: 'me',
    stampOwner,
  });
  const stampOwner = vi.fn();

  it('publishes once per version', async () => {
    const { rerender } = renderHook(
      (v: string) => useSharedBoardItemPublisher(args(v)),
      {
        initialProps: '1',
        wrapper,
      }
    );
    await act(flush);
    rerender('1');
    await act(flush);
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
    rerender('2');
    await act(flush);
    expect(fs.setDoc).toHaveBeenCalledTimes(2);
  });

  it('republishes when content reverts to a version published earlier', async () => {
    const { rerender } = renderHook(
      (v: string) => useSharedBoardItemPublisher(args(v)),
      { initialProps: 'A', wrapper }
    );
    await act(flush);
    rerender('B');
    await act(flush);
    rerender('A');
    await act(flush);
    expect(fs.setDoc).toHaveBeenCalledTimes(3);
    expect(fs.setDoc.mock.calls[2][1]).toMatchObject({ version: 'A' });
    rerender('A');
    await act(flush);
    expect(fs.setDoc).toHaveBeenCalledTimes(3);
  });

  it('keeps a newer version marked when an older write fails late', async () => {
    vi.spyOn(console, 'error').mockImplementation(noop);
    let failA: (e: Error) => void = noop;
    fs.setDoc.mockImplementationOnce(
      () => new Promise((_res, rej) => (failA = rej))
    );
    const { rerender, unmount } = renderHook(
      (v: string) => useSharedBoardItemPublisher(args(v)),
      { initialProps: 'A', wrapper }
    );
    await act(flush);
    rerender('B');
    await act(flush);
    await act(() => {
      failA(new Error('offline'));
      return flush();
    });
    unmount();
    storeCopy({ kind: 'quiz', itemId: 'q1', ownerUid: 'host', version: 'B' });
    renderHook(() => useSharedBoardItemPublisher(args('B')), { wrapper });
    await act(flush);
    expect(fs.setDoc).toHaveBeenCalledTimes(2);
  });

  it('writes again on a later mount when the stored copy was removed', async () => {
    const first = renderHook(() => useSharedBoardItemPublisher(args('1')), {
      wrapper,
    });
    await act(flush);
    first.unmount();
    renderHook(() => useSharedBoardItemPublisher(args('1')), { wrapper });
    await act(flush);
    expect(fs.setDoc).toHaveBeenCalledTimes(2);
  });

  it('names the owner in the widget config when it doesn’t already', async () => {
    renderHook(
      () =>
        useSharedBoardItemPublisher({ ...args('1'), stampedOwnerUid: 'host' }),
      { wrapper }
    );
    await act(flush);
    expect(stampOwner).toHaveBeenCalledWith('me');
  });

  it('neither publishes nor names the owner for an item they did not pick', async () => {
    stored = {};
    renderHook(
      () =>
        useSharedBoardItemPublisher({ ...args('1'), stampedOwnerUid: 'host' }),
      { wrapper }
    );
    await act(flush);
    expect(fs.setDoc).not.toHaveBeenCalled();
    expect(stampOwner).not.toHaveBeenCalled();
  });

  it('publishes once the owner’s pick arrives from another tab or device', async () => {
    stored = {};
    let emit: (s: unknown) => void = noop;
    fs.onSnapshot.mockImplementation(
      (ref: { path: string }, next: (s: unknown) => void) => {
        if (ref.path === PICKS) emit = next;
        return noop;
      }
    );
    renderHook(
      () =>
        useSharedBoardItemPublisher({ ...args('1'), stampedOwnerUid: 'host' }),
      { wrapper }
    );
    await act(flush);
    expect(fs.setDoc).not.toHaveBeenCalled();
    stored[PICKS] = { items: ['quiz_q1'] };
    await act(async () => {
      emit(snap({ items: ['quiz_q1'] }));
      await flush();
    });
    await act(flush);
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
    expect(stampOwner).toHaveBeenCalledWith('me');
  });

  it('names the owner in a second widget showing the same item while the first write is in flight', async () => {
    const a = renderHook(
      () =>
        useSharedBoardItemPublisher({ ...args('1'), stampedOwnerUid: 'host' }),
      { wrapper }
    );
    const b = renderHook(
      () =>
        useSharedBoardItemPublisher({ ...args('1'), stampedOwnerUid: 'host' }),
      { wrapper }
    );
    await act(flush);
    await act(flush);
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
    expect(stampOwner).toHaveBeenCalledTimes(2);
    a.unmount();
    b.unmount();
  });

  it('does nothing off a shared board', async () => {
    store.shareId = null;
    renderHook(() => useSharedBoardItemPublisher(args('1')), { wrapper });
    await act(flush);
    expect(fs.getDoc).not.toHaveBeenCalled();
    expect(stampOwner).not.toHaveBeenCalled();
  });
});
