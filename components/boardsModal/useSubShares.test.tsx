import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      opts?: { defaultValue?: string } & Record<string, unknown>
    ) => opts?.defaultValue ?? _key,
  }),
}));

const listSubstituteCollectionShares = vi.fn(() => Promise.resolve(shares));
const updateSubstituteCollectionShare = vi.fn((_input: unknown) =>
  Promise.resolve()
);
const extendSubstituteCollectionShare = vi.fn(
  (_shareId: string, _expiresAt: number) => Promise.resolve()
);
const endSubstituteCollectionShare = vi.fn((_shareId: string) =>
  Promise.resolve()
);
const addToast = vi.fn();
const showConfirm = vi.fn(() => Promise.resolve(true));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    dashboards,
    collectionsApi: { collections },
    rosters: [],
    activeRosterId: null,
    addToast,
    listSubstituteCollectionShares,
    updateSubstituteCollectionShare,
    extendSubstituteCollectionShare,
    endSubstituteCollectionShare,
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));

import { useSubShares } from './useSubShares';
import type { Collection, Dashboard, SharedCollection } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const boardIn = (id: string, collectionId: string | null): Dashboard => ({
  id,
  name: `Board ${id}`,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1_700_000_000_000,
  ...(collectionId !== null && { collectionId }),
});

let dashboards: Dashboard[] = [];
let collections: Collection[] = [];
let shares: SharedCollection[] = [];

const share = (over: Partial<SharedCollection> = {}): SharedCollection => ({
  shareId: 'share-1',
  hostUid: 'host-1',
  hostDisplayName: 'Teacher',
  intendedMode: 'substitute',
  collection: { name: 'Week of Oct 6' },
  boardIds: ['b1'],
  createdAt: 1_700_000_000_000,
  expiresAt: Date.now() + DAY_MS,
  buildingId: 'high',
  kind: 'collection',
  sourceId: 'coll-1',
  ...over,
});

describe('useSubShares', () => {
  beforeEach(() => {
    dashboards = [boardIn('b1', 'coll-1'), boardIn('b2', 'coll-1')];
    collections = [
      {
        id: 'coll-1',
        name: 'Week of Oct 6',
        parentCollectionId: null,
        order: 0,
        createdAt: 1_700_000_000_000,
      },
    ];
    shares = [share()];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const load = async () => {
    const view = renderHook(() => useSubShares());
    await waitFor(() => expect(view.result.current.shares).toHaveLength(1));
    return view;
  };

  it('reports the end time by the Board or Collection the share came from', async () => {
    const { result } = await load();
    expect(result.current.endsAtFor('coll-1')).toBe(shares[0].expiresAt);
    expect(result.current.endsAtFor('coll-2')).toBeNull();
  });

  // The point of "Push my changes": the sub gets the collection as it is now,
  // including a board the teacher added after sharing.
  it('re-pushes the collection as it stands today', async () => {
    const { result } = await load();

    await act(async () => {
      result.current.updateNow(shares[0]);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(updateSubstituteCollectionShare).toHaveBeenCalled()
    );
    const input = updateSubstituteCollectionShare.mock.calls[0]?.[0] as {
      shareId: string;
      boards: Dashboard[];
    };
    expect(input.shareId).toBe('share-1');
    expect(input.boards.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('refuses to re-push a collection whose boards are all gone', async () => {
    collections = [];
    const { result } = await load();

    await act(async () => {
      result.current.updateNow(shares[0]);
      await Promise.resolve();
    });

    expect(updateSubstituteCollectionShare).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(
      'The boards behind this share are gone. End it and share again.',
      'error'
    );
  });

  it('adds a week to the end time', async () => {
    const { result } = await load();
    const before = shares[0].expiresAt as number;

    await act(async () => {
      result.current.extend(shares[0]);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(extendSubstituteCollectionShare).toHaveBeenCalled()
    );
    const [shareId, next] = extendSubstituteCollectionShare.mock
      .calls[0] as unknown as [string, number];
    expect(shareId).toBe('share-1');
    expect(next).toBe(before + 7 * DAY_MS);
  });

  // D11: fourteen days is the most a sub share can run, and the rules enforce
  // it, so the button has to stop short rather than write a rejected update.
  it('will not push the end time past fourteen days', async () => {
    shares = [share({ expiresAt: Date.now() + 13.9 * DAY_MS })];
    const { result } = await load();

    await act(async () => {
      result.current.extend(shares[0]);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(extendSubstituteCollectionShare).toHaveBeenCalled()
    );
    const [, next] = extendSubstituteCollectionShare.mock
      .calls[0] as unknown as [string, number];
    expect(next).toBeLessThanOrEqual(Date.now() + 14 * DAY_MS);
  });

  it('says so instead of writing when the share is already at the cap', async () => {
    shares = [share({ expiresAt: Date.now() + 13.99 * DAY_MS })];
    const { result } = await load();

    await act(async () => {
      result.current.extend(shares[0]);
      await Promise.resolve();
    });

    expect(extendSubstituteCollectionShare).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(
      'A sub share can run for at most 14 days.',
      'info'
    );
  });

  it('asks before ending a share, and does not end it when the teacher says no', async () => {
    showConfirm.mockResolvedValueOnce(false as unknown as true);
    const { result } = await load();

    await act(async () => {
      result.current.end(shares[0]);
      await Promise.resolve();
    });

    expect(showConfirm).toHaveBeenCalled();
    expect(endSubstituteCollectionShare).not.toHaveBeenCalled();
  });

  it('ends the share once the teacher confirms', async () => {
    const { result } = await load();

    await act(async () => {
      result.current.end(shares[0]);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(endSubstituteCollectionShare).toHaveBeenCalledWith('share-1')
    );
  });
});
