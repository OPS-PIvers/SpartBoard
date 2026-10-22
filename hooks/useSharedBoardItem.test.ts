import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn((...parts: unknown[]) => ({ path: parts.slice(1).join('/') })),
}));
vi.mock('firebase/firestore', () => fs);
vi.mock('@/config/firebase', () => ({ db: {} }));

const store = { shareId: 'share-1' as string | null };

const auth = vi.hoisted(() => ({ uid: 'me', flag: true }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: auth.uid },
    canAccessFeature: (id: string) =>
      id === 'shared-board-live-walls' && auth.flag,
  }),
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

beforeEach(() => {
  vi.clearAllMocks();
  store.shareId = 'share-1';
  auth.uid = 'me';
  auth.flag = true;
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
    fs.getDoc.mockResolvedValue(snap(null));
    const build = vi.fn(() => Promise.resolve({ a: 1 }));
    await expect(publishSharedBoardItem('share-1', item, build)).resolves.toBe(
      true
    );
    expect(fs.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ...item, payload: { a: 1 } })
    );
  });

  it('skips the same version and never builds', async () => {
    fs.getDoc.mockResolvedValue(snap({ ownerUid: 'me', version: '5' }));
    const build = vi.fn();
    await expect(publishSharedBoardItem('share-1', item, build)).resolves.toBe(
      false
    );
    expect(build).not.toHaveBeenCalled();
    expect(fs.setDoc).not.toHaveBeenCalled();
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
    fs.getDoc.mockResolvedValue(snap(null));
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

  it('names the owner in the widget config when it doesn’t already', async () => {
    fs.getDoc.mockResolvedValue(snap(null));
    renderHook(
      () =>
        useSharedBoardItemPublisher({ ...args('1'), stampedOwnerUid: 'host' }),
      { wrapper }
    );
    await act(flush);
    expect(stampOwner).toHaveBeenCalledWith('me');
  });

  it('does nothing without the flag or off a shared board', async () => {
    fs.getDoc.mockResolvedValue(snap(null));
    auth.flag = false;
    renderHook(() => useSharedBoardItemPublisher(args('1')), { wrapper });
    auth.flag = true;
    store.shareId = null;
    renderHook(() => useSharedBoardItemPublisher(args('1')), { wrapper });
    await act(flush);
    expect(fs.getDoc).not.toHaveBeenCalled();
    expect(stampOwner).not.toHaveBeenCalled();
  });
});
