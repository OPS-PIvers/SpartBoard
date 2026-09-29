import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubCollectionShares } from '@/components/subs/useSubCollectionShares';
import type { SharedCollection } from '@/types';

type SnapHandler = (snap: {
  docs: Array<{ id: string; data: () => unknown }>;
}) => void;
type ErrHandler = (err: { code?: string }) => void;

let emit: SnapHandler = () => undefined;
let fail: ErrHandler = () => undefined;
const unsubscribe = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db: unknown, path: string) => ({ path })),
  query: vi.fn((...args: unknown[]) => ({ args })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
  onSnapshot: vi.fn((_q: unknown, next: SnapHandler, onErr: ErrHandler) => {
    emit = next;
    fail = onErr;
    return unsubscribe;
  }),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const share = (shareId: string, expiresAt = Date.now() + 86400000) =>
  ({
    shareId,
    hostUid: 'host-uid',
    hostDisplayName: 'Mr. Teacher',
    intendedMode: 'substitute',
    collection: { name: shareId },
    boardIds: ['b1'],
    createdAt: 0,
    expiresAt,
    buildingId: 'middle-school',
  }) as SharedCollection;

const docs = (...items: SharedCollection[]) => ({
  docs: items.map((c) => ({ id: c.shareId, data: () => c })),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSubCollectionShares', () => {
  it('is loading until the first snapshot arrives', () => {
    const { result } = renderHook(() =>
      useSubCollectionShares('middle-school')
    );
    expect(result.current.loading).toBe(true);
  });

  it('lists shares and drops one the teacher has just ended', () => {
    const { result } = renderHook(() =>
      useSubCollectionShares('middle-school')
    );
    act(() => emit(docs(share('s1'), share('s2'))));
    expect(result.current.collections.map((c) => c.shareId)).toEqual([
      's1',
      's2',
    ]);
    act(() => emit(docs(share('s1'), share('s2', Date.now() - 1))));
    expect(result.current.collections.map((c) => c.shareId)).toEqual(['s1']);
  });

  it('reports a failed subscription rather than an empty list', () => {
    const { result } = renderHook(() =>
      useSubCollectionShares('middle-school')
    );
    act(() => fail({ code: 'unavailable' }));
    expect(result.current.loading).toBe(false);
    expect(result.current.errored).toBe(true);
  });

  it('retries a permission-denied read before giving up', () => {
    const { result } = renderHook(() =>
      useSubCollectionShares('middle-school')
    );
    act(() => fail({ code: 'permission-denied' }));
    expect(result.current.loading).toBe(true);
    expect(result.current.errored).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() =>
      useSubCollectionShares('middle-school')
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
