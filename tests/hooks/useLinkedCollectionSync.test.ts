import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useLinkedCollectionSync,
  type LinkedCollectionSyncDeps,
} from '@/hooks/useLinkedCollectionSync';
import {
  beginLinkedCollectionImport,
  endLinkedCollectionImport,
} from '@/utils/linkedCollectionImportLock';
import type { SharedBoardSnapshot } from '@/hooks/useFirestore';
import type {
  Collection,
  Dashboard,
  LinkedCollection,
  LinkedCollectionMode,
} from '@/types';

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

type LinkCb = (
  link: LinkedCollection | null,
  meta?: { fromCache: boolean }
) => void;

const root: Collection = {
  id: 'week',
  name: 'Week',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  linkedCollectionId: 'L1',
  linkedCollectionRole: 'collaborator',
};

const board = (
  id: string,
  collectionId: string | null,
  extra: Partial<Dashboard> = {}
): Dashboard => ({
  id,
  name: id,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 0,
  collectionId,
  ...extra,
});

const live = (shareId: string, role: Dashboard['linkedShareRole']) => ({
  linkedShareId: shareId,
  linkedShareRole: role,
  linkedShareEnded: false as const,
});

const makeLink = (extra: Partial<LinkedCollection> = {}): LinkedCollection => ({
  linkId: 'L1',
  hostUid: 'host',
  hostName: 'Host',
  mode: 'synced',
  name: 'Week',
  boards: [],
  participants: { me: { role: 'collaborator', joinedAt: 1 } },
  createdAt: 0,
  updatedAt: 0,
  updatedBy: 'host',
  ...extra,
});

const share = (
  shareId: string,
  extra: Partial<SharedBoardSnapshot> = {}
): SharedBoardSnapshot => ({
  ...board(shareId, null),
  intendedMode: 'synced',
  linkedCollectionId: 'L1',
  originalAuthor: 'host',
  participants: {},
  ...extra,
});

let linkCb: LinkCb | null;
let shares: Map<string, SharedBoardSnapshot | null>;
let linkDoc: LinkedCollection;

const makeDeps = (
  overrides: Partial<LinkedCollectionSyncDeps> = {}
): LinkedCollectionSyncDeps => ({
  enabled: true,
  uid: 'me',
  displayName: 'Me',
  collections: [root],
  dashboards: [],
  collectionsApi: {
    createCollection: vi.fn().mockResolvedValue('new-col'),
    setCollectionMetadata: vi.fn().mockResolvedValue(undefined),
    setCollectionLink: vi.fn().mockResolvedValue(undefined),
    moveCollection: vi.fn().mockResolvedValue(undefined),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
  },
  linkedCollectionApi: {
    subscribeLinkedCollection: vi.fn((_id: string, cb: LinkCb) => {
      linkCb = cb;
      return () => {
        linkCb = null;
      };
    }),
    editLinkedCollection: vi.fn(
      (
        _id: string,
        _uid: string,
        edit: (l: LinkedCollection) => Partial<LinkedCollection> | null
      ) => {
        const patch = edit(linkDoc);
        if (!patch) return Promise.resolve(false);
        linkDoc = { ...linkDoc, ...patch };
        return Promise.resolve(true);
      }
    ),
    updateLinkedCollection: vi.fn().mockResolvedValue(undefined),
    endLinkedCollection: vi.fn().mockResolvedValue(undefined),
    leaveLinkedCollection: vi.fn().mockResolvedValue(undefined),
  },
  loadSharedBoard: vi.fn((id: string) =>
    Promise.resolve(shares.get(id) ?? null)
  ),
  joinSharedBoard: vi.fn().mockResolvedValue(undefined),
  leaveSharedBoard: vi.fn().mockResolvedValue(undefined),
  stopSharingBoard: vi.fn().mockResolvedValue(undefined),
  shareBoard: vi.fn((_b: Dashboard, _m: LinkedCollectionMode, _l: string) =>
    Promise.resolve('new-share')
  ),
  createBoard: vi.fn().mockResolvedValue('local-id'),
  deleteBoard: vi.fn().mockResolvedValue(undefined),
  setBoardLink: vi.fn().mockResolvedValue(undefined),
  moveBoard: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn(),
  renameBoard: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const emit = async (link: LinkedCollection, fromCache = false) => {
  linkDoc = link;
  await act(async () => {
    linkCb?.(link, { fromCache });
    await new Promise((r) => setTimeout(r, 0));
  });
};

beforeEach(() => {
  linkCb = null;
  shares = new Map();
  linkDoc = makeLink();
});

describe('useLinkedCollectionSync', () => {
  it('holds one listener per shared collection and none when the flag is off', () => {
    const deps = makeDeps({ enabled: false });
    renderHook(() => useLinkedCollectionSync(deps));
    expect(
      deps.linkedCollectionApi.subscribeLinkedCollection
    ).not.toHaveBeenCalled();

    const on = makeDeps();
    renderHook(() => useLinkedCollectionSync(on));
    expect(
      on.linkedCollectionApi.subscribeLinkedCollection
    ).toHaveBeenCalledTimes(1);
  });

  it('imports a listed board it doesn’t have, only when the share names this link', async () => {
    shares.set('s1', share('s1', { name: 'Monday plan' }));
    shares.set('s2', share('s2', { linkedCollectionId: 'OTHER' }));
    const deps = makeDeps();
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        boards: [
          { shareId: 's1', name: 'Mon', order: 0 },
          { shareId: 's2', name: 'Spoof', order: 1 },
        ],
      })
    );
    await waitFor(() => expect(deps.createBoard).toHaveBeenCalledTimes(1));
    const [data, collectionId] = vi.mocked(deps.createBoard).mock.calls[0];
    expect(collectionId).toBe('week');
    expect(data).toMatchObject({
      name: 'Mon',
      linkedShareId: 's1',
      linkedShareRole: 'collaborator',
    });
    expect(deps.joinSharedBoard).toHaveBeenCalledWith(
      's1',
      'collaborator',
      'Me'
    );
  });

  it('imports into a View-Only collection as a viewer', async () => {
    shares.set('s1', share('s1', { intendedMode: 'view-only' }));
    const deps = makeDeps();
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        mode: 'view-only',
        participants: { me: { role: 'viewer', joinedAt: 1 } },
        boards: [{ shareId: 's1', name: 'Mon', order: 0 }],
      })
    );
    await waitFor(() => expect(deps.createBoard).toHaveBeenCalled());
    expect(vi.mocked(deps.createBoard).mock.calls[0][0].linkedShareRole).toBe(
      'viewer'
    );
  });

  it('does nothing while that link’s import is running', async () => {
    shares.set('s1', share('s1'));
    const deps = makeDeps();
    renderHook(() => useLinkedCollectionSync(deps));
    beginLinkedCollectionImport('L1');
    try {
      await emit(
        makeLink({ boards: [{ shareId: 's1', name: 'A', order: 0 }] })
      );
      expect(deps.createBoard).not.toHaveBeenCalled();
    } finally {
      endLinkedCollectionImport('L1');
    }
  });

  it('picks up a board the import couldn’t save once the import ends', async () => {
    shares.set('s1', share('s1'));
    const deps = makeDeps();
    renderHook(() => useLinkedCollectionSync(deps));
    beginLinkedCollectionImport('L1');
    await emit(makeLink({ boards: [{ shareId: 's1', name: 'A', order: 0 }] }));
    expect(deps.createBoard).not.toHaveBeenCalled();
    act(() => endLinkedCollectionImport('L1'));
    await waitFor(() => expect(deps.createBoard).toHaveBeenCalledTimes(1));
  });

  it('retries a board whose share failed to load on the next snapshot', async () => {
    shares.set('s1', share('s1'));
    const deps = makeDeps();
    vi.mocked(deps.loadSharedBoard).mockRejectedValueOnce(new Error('offline'));
    renderHook(() => useLinkedCollectionSync(deps));
    const link = makeLink({ boards: [{ shareId: 's1', name: 'A', order: 0 }] });
    await emit(link);
    await emit({ ...link });
    await waitFor(() => expect(deps.createBoard).toHaveBeenCalledTimes(1));
  });

  it('does not retry a share this teacher is not allowed to read', async () => {
    shares.set('s1', share('s1'));
    const deps = makeDeps();
    vi.mocked(deps.loadSharedBoard).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'permission-denied' })
    );
    renderHook(() => useLinkedCollectionSync(deps));
    const link = makeLink({ boards: [{ shareId: 's1', name: 'A', order: 0 }] });
    await emit(link);
    await emit({ ...link });
    await waitFor(() => expect(deps.loadSharedBoard).toHaveBeenCalledTimes(1));
    expect(deps.createBoard).not.toHaveBeenCalled();
  });

  it('removes a board the link dropped when its share belongs to the link', async () => {
    shares.set('s1', share('s1'));
    const deps = makeDeps({
      dashboards: [board('a', 'week', live('s1', 'collaborator'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: [] }));
    await waitFor(() => expect(deps.deleteBoard).toHaveBeenCalledWith('a'));
    expect(deps.stopSharingBoard).not.toHaveBeenCalled();
  });

  it('also ends the share when the dropped board is this teacher’s own', async () => {
    shares.set('s1', share('s1', { originalAuthor: 'me' }));
    const deps = makeDeps({
      dashboards: [board('a', 'week', live('s1', 'owner'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: [] }));
    await waitFor(() =>
      expect(deps.stopSharingBoard).toHaveBeenCalledWith('s1')
    );
    expect(deps.deleteBoard).toHaveBeenCalledWith('a');
  });

  it('keeps a board shared on its own that was moved into the collection', async () => {
    shares.set('solo', share('solo', { linkedCollectionId: undefined }));
    const deps = makeDeps({
      dashboards: [board('a', 'week', live('solo', 'owner'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: [] }));
    await waitFor(() =>
      expect(deps.loadSharedBoard).toHaveBeenCalledWith('solo')
    );
    expect(deps.deleteBoard).not.toHaveBeenCalled();
  });

  it('never removes boards on a cached snapshot', async () => {
    shares.set('s1', share('s1'));
    const deps = makeDeps({
      dashboards: [board('a', 'week', live('s1', 'collaborator'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: [] }), true);
    expect(deps.deleteBoard).not.toHaveBeenCalled();
  });

  it('takes the shared collection’s new name', async () => {
    const deps = makeDeps();
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ name: 'Week 2' }));
    await waitFor(() =>
      expect(deps.collectionsApi.setCollectionMetadata).toHaveBeenCalledWith(
        'week',
        { name: 'Week 2' }
      )
    );
  });

  it('creates a sub-collection another member added', async () => {
    const deps = makeDeps();
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        sections: [{ id: 'S-new', name: 'Friday', parentId: null, order: 3 }],
      })
    );
    await waitFor(() =>
      expect(deps.collectionsApi.createCollection).toHaveBeenCalledWith(
        'Friday',
        'week',
        { color: undefined, order: 3, linkedSectionId: 'S-new' }
      )
    );
  });

  it('shares and lists a board a collaborator adds to the collection', async () => {
    const deps = makeDeps({
      dashboards: [board('fresh', 'week', { name: 'Fresh board' })],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink());
    await waitFor(() => expect(deps.setBoardLink).toHaveBeenCalled());
    expect(deps.shareBoard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fresh' }),
      'synced',
      'L1'
    );
    expect(linkDoc.boards).toEqual([
      { shareId: 'new-share', name: 'Fresh board', order: 0 },
    ]);
    expect(deps.setBoardLink).toHaveBeenCalledWith('fresh', {
      linkedShareId: 'new-share',
      linkedShareRole: 'owner',
      linkedShareHostName: 'Me',
      linkedShareHostUid: 'me',
      linkedShareEnded: false,
    });
  });

  it('doesn’t delete a board it just added before a snapshot lists it', async () => {
    shares.set('new-share', share('new-share', { originalAuthor: 'me' }));
    let dashboards = [board('fresh', 'week')];
    const deps = makeDeps();
    const { rerender } = renderHook(
      (p: { dashboards: Dashboard[] }) =>
        useLinkedCollectionSync({ ...deps, dashboards: p.dashboards }),
      { initialProps: { dashboards } }
    );
    const listed = makeLink();
    await emit(listed);
    await waitFor(() => expect(deps.setBoardLink).toHaveBeenCalled());
    dashboards = [board('fresh', 'week', live('new-share', 'owner'))];
    rerender({ dashboards });
    // A snapshot from before the add lands late.
    await emit(listed);
    expect(deps.deleteBoard).not.toHaveBeenCalled();
  });

  it('undoes the board share when it can’t be listed', async () => {
    const deps = makeDeps({ dashboards: [board('fresh', 'week')] });
    vi.mocked(deps.linkedCollectionApi.editLinkedCollection).mockRejectedValue(
      new Error('permission-denied')
    );
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink());
    await waitFor(() =>
      expect(deps.stopSharingBoard).toHaveBeenCalledWith('new-share')
    );
    expect(deps.setBoardLink).not.toHaveBeenCalled();
  });

  it('never shares or lists boards for a viewer', async () => {
    const deps = makeDeps({ dashboards: [board('fresh', 'week')] });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        mode: 'view-only',
        participants: { me: { role: 'viewer', joinedAt: 1 } },
      })
    );
    expect(deps.shareBoard).not.toHaveBeenCalled();
  });

  it('pauses for a teacher no longer in the link', async () => {
    shares.set('s1', share('s1'));
    const deps = makeDeps({ dashboards: [board('fresh', 'week')] });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        participants: {},
        boards: [{ shareId: 's1', name: 'A', order: 0 }],
      })
    );
    expect(deps.createBoard).not.toHaveBeenCalled();
    expect(deps.shareBoard).not.toHaveBeenCalled();
  });

  describe('a board leaving the collection', () => {
    const listedLink = () =>
      makeLink({
        sections: [{ id: 'S-mon', name: 'Monday', parentId: null, order: 0 }],
        boards: [
          { shareId: 's1', name: 'A', order: 0 },
          { shareId: 's2', name: 'B', order: 1 },
        ],
      });
    const mon: Collection = {
      id: 'mon',
      name: 'Monday',
      parentCollectionId: 'week',
      order: 0,
      createdAt: 0,
      linkedSectionId: 'S-mon',
    };
    const dashboards = [
      board('a', 'week', live('s1', 'collaborator')),
      board('b', 'week', live('s2', 'owner')),
    ];

    it('counts only boards that leave for everyone', async () => {
      shares.set('s1', share('s1'));
      shares.set('s2', share('s2', { originalAuthor: 'me' }));
      const deps = makeDeps({ dashboards, collections: [root, mon] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(listedLink());
      expect(
        result.current.countRemovedForEveryone(['a', 'b'], { kind: 'delete' })
      ).toBe(2);
      expect(
        result.current.countRemovedForEveryone(['a'], {
          kind: 'move',
          collectionId: null,
        })
      ).toBe(1);
      expect(
        result.current.countRemovedForEveryone(['a'], {
          kind: 'move',
          collectionId: 'mon',
        })
      ).toBe(0);
    });

    it('a viewer’s delete never counts', async () => {
      const deps = makeDeps({ dashboards, collections: [root, mon] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit({
        ...listedLink(),
        participants: { me: { role: 'viewer', joinedAt: 1 } },
      });
      expect(
        result.current.countRemovedForEveryone(['a'], { kind: 'delete' })
      ).toBe(0);
    });

    it('moving out unlists it and keeps it as this teacher’s own board', async () => {
      shares.set('s1', share('s1'));
      shares.set('s2', share('s2', { originalAuthor: 'me' }));
      const deps = makeDeps({ dashboards, collections: [root, mon] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(listedLink());
      let finish: ((landed: boolean) => Promise<void>) | undefined;
      await act(async () => {
        finish = await result.current.beforeBoardsLeave(['a', 'b'], {
          kind: 'move',
          collectionId: null,
        });
      });
      // The move lands before the list changes, so no tab sees an unlinked board inside.
      expect(linkDoc.boards).toHaveLength(2);
      expect(deps.setBoardLink).not.toHaveBeenCalled();
      await act(async () => {
        await finish?.(true);
      });
      expect(linkDoc.boards).toEqual([]);
      expect(deps.leaveSharedBoard).toHaveBeenCalledWith('s1');
      expect(deps.stopSharingBoard).toHaveBeenCalledWith('s2');
      expect(deps.setBoardLink).toHaveBeenCalledWith('a', null);
      expect(deps.setBoardLink).toHaveBeenCalledWith('b', null);
    });

    it('deleting unlists it without detaching first', async () => {
      shares.set('s1', share('s1'));
      const deps = makeDeps({ dashboards, collections: [root, mon] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(listedLink());
      await act(async () => {
        await (
          await result.current.beforeBoardsLeave(['a'], { kind: 'delete' })
        )(true);
      });
      expect(linkDoc.boards.map((b) => b.shareId)).toEqual(['s2']);
      expect(deps.leaveSharedBoard).toHaveBeenCalledWith('s1');
      expect(deps.setBoardLink).not.toHaveBeenCalled();
    });

    it('moving into a sub-collection updates where the link puts it', async () => {
      const deps = makeDeps({ dashboards, collections: [root, mon] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(listedLink());
      await act(async () => {
        await (
          await result.current.beforeBoardsLeave(['a'], {
            kind: 'move',
            collectionId: 'mon',
          })
        )(true);
      });
      expect(linkDoc.boards[0]).toEqual({
        shareId: 's1',
        name: 'A',
        order: 0,
        sectionId: 'S-mon',
      });
      expect(deps.leaveSharedBoard).not.toHaveBeenCalled();
    });
  });

  it('carries a rename of the collection and of a sub-collection to the link', async () => {
    const mon: Collection = {
      id: 'mon',
      name: 'Monday',
      parentCollectionId: 'week',
      order: 0,
      createdAt: 0,
      linkedSectionId: 'S-mon',
    };
    const deps = makeDeps({ collections: [root, mon] });
    const { result } = renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        sections: [{ id: 'S-mon', name: 'Monday', parentId: null, order: 0 }],
      })
    );
    await act(async () => {
      await result.current.pushCollectionMetadata('week', { name: 'Week 3' });
      await result.current.pushCollectionMetadata('mon', { name: 'Mon' });
    });
    expect(
      deps.linkedCollectionApi.updateLinkedCollection
    ).toHaveBeenCalledWith('L1', 'me', { name: 'Week 3' });
    expect(linkDoc.sections?.[0].name).toBe('Mon');
  });

  it('keeps a move-out board listed when the move fails', async () => {
    shares.set('s1', share('s1'));
    linkDoc = makeLink({ boards: [{ shareId: 's1', name: 'A', order: 0 }] });
    const deps = makeDeps({
      dashboards: [board('a', 'week', live('s1', 'collaborator'))],
    });
    const { result } = renderHook(() => useLinkedCollectionSync(deps));
    await emit(linkDoc);
    await act(async () => {
      await (
        await result.current.beforeBoardsLeave(['a'], {
          kind: 'move',
          collectionId: null,
        })
      )(false);
    });
    expect(linkDoc.boards).toHaveLength(1);
    expect(deps.leaveSharedBoard).not.toHaveBeenCalled();
  });

  it('puts a board back on the list when its delete fails', async () => {
    shares.set('s1', share('s1'));
    linkDoc = makeLink({ boards: [{ shareId: 's1', name: 'A', order: 0 }] });
    const deps = makeDeps({
      dashboards: [board('a', 'week', live('s1', 'collaborator'))],
    });
    const { result } = renderHook(() => useLinkedCollectionSync(deps));
    await emit(linkDoc);
    let finish: ((landed: boolean) => Promise<void>) | undefined;
    await act(async () => {
      finish = await result.current.beforeBoardsLeave(['a'], {
        kind: 'delete',
      });
    });
    expect(linkDoc.boards).toHaveLength(0);
    await act(async () => {
      await finish?.(false);
    });
    expect(linkDoc.boards.map((b) => b.shareId)).toEqual(['s1']);
    expect(deps.leaveSharedBoard).not.toHaveBeenCalled();
  });

  it('removes an imported copy whose share is already gone', async () => {
    const deps = makeDeps({
      dashboards: [board('linked-s1', 'week', live('s1', 'collaborator'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: [] }));
    await waitFor(() =>
      expect(deps.deleteBoard).toHaveBeenCalledWith('linked-s1')
    );
  });

  it('keeps a board shared on its own whose share ended, as a plain board', async () => {
    const deps = makeDeps({
      dashboards: [
        board('mine', 'week', {
          ...live('solo', 'collaborator'),
          linkedShareEnded: true,
        }),
      ],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: [] }));
    await waitFor(() =>
      expect(deps.setBoardLink).toHaveBeenCalledWith('mine', null)
    );
    expect(deps.deleteBoard).not.toHaveBeenCalled();
  });

  it('removes an open copy that already learned its share ended (D4)', async () => {
    const deps = makeDeps({
      dashboards: [
        board('linked-s1', 'week', {
          ...live('s1', 'collaborator'),
          linkedShareEnded: true,
        }),
      ],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: [] }));
    await waitFor(() =>
      expect(deps.deleteBoard).toHaveBeenCalledWith('linked-s1')
    );
    expect(deps.shareBoard).not.toHaveBeenCalled();
  });

  it('imports with the fixed local id so two tabs make one board', async () => {
    shares.set('s1', share('s1'));
    const deps = makeDeps();
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: [{ shareId: 's1', name: 'A', order: 0 }] }));
    await waitFor(() => expect(deps.createBoard).toHaveBeenCalled());
    expect(vi.mocked(deps.createBoard).mock.calls[0][0].id).toBe('linked-s1');
  });

  it('unlists and ends the share of a board deleted while it was being listed', async () => {
    let dashboards = [board('fresh', 'week')];
    const deps = makeDeps();
    let release: () => void = () => undefined;
    vi.mocked(deps.shareBoard).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve('new-share');
        })
    );
    const { result, rerender } = renderHook(
      (p: { dashboards: Dashboard[] }) =>
        useLinkedCollectionSync({ ...deps, dashboards: p.dashboards }),
      { initialProps: { dashboards } }
    );
    await emit(makeLink());
    await waitFor(() => expect(deps.shareBoard).toHaveBeenCalled());
    await act(async () => {
      await (
        await result.current.beforeBoardsLeave(['fresh'], { kind: 'delete' })
      )(true);
    });
    dashboards = [];
    rerender({ dashboards });
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() =>
      expect(deps.stopSharingBoard).toHaveBeenCalledWith('new-share')
    );
    expect(linkDoc.boards).toEqual([]);
    expect(deps.setBoardLink).not.toHaveBeenCalled();
  });

  describe('sub-collections and board names', () => {
    const col = (
      id: string,
      parentCollectionId: string,
      linkedSectionId?: string
    ): Collection => ({
      id,
      name: id,
      parentCollectionId,
      order: 0,
      createdAt: 0,
      ...(linkedSectionId && { linkedSectionId }),
    });
    const mon = col('mon', 'week', 'S-mon');
    const tue = col('tue', 'week', 'S-tue');
    const sections = [
      { id: 'S-mon', name: 'mon', parentId: null, order: 0 },
      { id: 'S-tue', name: 'tue', parentId: null, order: 1 },
    ];

    it('takes a board rename from the link', async () => {
      const deps = makeDeps({
        dashboards: [
          board('a', 'week', { ...live('s1', 'collaborator'), name: 'Old' }),
        ],
      });
      renderHook(() => useLinkedCollectionSync(deps));
      await emit(
        makeLink({ boards: [{ shareId: 's1', name: 'Day 1', order: 0 }] })
      );
      expect(deps.renameBoard).toHaveBeenCalledWith('a', 'Day 1');
    });

    it('lists a local board rename and does not undo it before the link shows it', async () => {
      linkDoc = makeLink({
        boards: [{ shareId: 's1', name: 'Old', order: 0 }],
      });
      const deps = makeDeps({
        dashboards: [
          board('a', 'week', { ...live('s1', 'collaborator'), name: 'New' }),
        ],
      });
      const edit = vi.mocked(deps.linkedCollectionApi.editLinkedCollection);
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      vi.mocked(deps.renameBoard).mockClear();
      // The list write is still in flight when an older snapshot arrives.
      let release: () => void = () => undefined;
      edit.mockImplementationOnce(
        (_id, _uid, fn) =>
          new Promise((resolve) => {
            release = () => {
              const patch = fn(linkDoc);
              if (patch) linkDoc = { ...linkDoc, ...patch };
              resolve(!!patch);
            };
          })
      );
      let pushed: Promise<void> | undefined;
      act(() => {
        pushed = result.current.pushBoardName('a', 'New');
      });
      await emit(
        makeLink({ boards: [{ shareId: 's1', name: 'Old', order: 0 }] })
      );
      expect(deps.renameBoard).not.toHaveBeenCalled();
      await act(async () => {
        release();
        await pushed;
      });
      expect(linkDoc.boards[0].name).toBe('New');
    });

    it('a viewer never writes a board rename to the list', async () => {
      linkDoc = makeLink({
        mode: 'view-only',
        participants: { me: { role: 'viewer', joinedAt: 1 } },
        boards: [{ shareId: 's1', name: 'Old', order: 0 }],
      });
      const deps = makeDeps({
        dashboards: [board('a', 'week', live('s1', 'viewer'))],
      });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      await act(async () => {
        await result.current.pushBoardName('a', 'Mine');
      });
      expect(linkDoc.boards[0].name).toBe('Old');
    });

    it('a viewer keeps their own board name until the host renames that board', async () => {
      const viewerLink = (name: string) =>
        makeLink({
          mode: 'view-only',
          participants: { me: { role: 'viewer', joinedAt: 1 } },
          boards: [{ shareId: 's1', name, order: 0 }],
        });
      const deps = makeDeps({
        dashboards: [
          board('a', 'week', { ...live('s1', 'viewer'), name: 'Mine' }),
        ],
      });
      renderHook(() => useLinkedCollectionSync(deps));
      await emit(viewerLink('Old'));
      await emit(viewerLink('Old'));
      expect(deps.renameBoard).not.toHaveBeenCalled();
      await emit(viewerLink('Host renamed'));
      expect(deps.renameBoard).toHaveBeenCalledWith('a', 'Host renamed');
    });

    it('never lists a move of a sub-collection into its own child', async () => {
      linkDoc = makeLink({
        sections: [
          sections[0],
          { id: 'S-child', name: 'child', parentId: 'S-mon', order: 0 },
        ],
      });
      const child = col('child', 'mon', 'S-child');
      const deps = makeDeps({ collections: [root, mon, child] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      const before = linkDoc.sections;
      const move = vi.fn(() =>
        Promise.reject(
          new Error(
            'Cannot move a collection into one of its own subcollections'
          )
        )
      );
      await act(async () => {
        await expect(
          result.current.moveCollectionSynced('mon', 'child', move)
        ).rejects.toThrow();
      });
      expect(linkDoc.sections).toBe(before);
    });

    it('still moves and deletes locally when the shared list cannot be written', async () => {
      linkDoc = makeLink({ sections });
      const deps = makeDeps({ collections: [root, mon, tue] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      vi.mocked(
        deps.linkedCollectionApi.editLinkedCollection
      ).mockRejectedValue(new Error('offline'));
      const move = vi.fn(() => Promise.resolve());
      const remove = vi.fn(() => Promise.resolve());
      await act(async () => {
        await result.current.moveCollectionSynced('tue', 'mon', move);
        await result.current.deleteCollectionSynced(
          'mon',
          'move-to-parent',
          remove
        );
      });
      expect(move).toHaveBeenCalled();
      expect(remove).toHaveBeenCalled();
    });

    it('deletes a sub-collection the link records as deleted, only on a server snapshot', async () => {
      const deps = makeDeps({ collections: [root, mon, tue] });
      renderHook(() => useLinkedCollectionSync(deps));
      const dropped = makeLink({
        sections: [sections[1]],
        deletedSections: ['S-mon'],
      });
      await emit(dropped, true);
      expect(deps.collectionsApi.deleteCollection).not.toHaveBeenCalled();
      await emit(dropped);
      await waitFor(() =>
        expect(deps.collectionsApi.deleteCollection).toHaveBeenCalled()
      );
      expect(deps.collectionsApi.deleteCollection).toHaveBeenCalledWith(
        'mon',
        'move-to-parent'
      );
      expect(deps.collectionsApi.deleteCollection).toHaveBeenCalledTimes(1);
    });

    it('never deletes a new local sub-collection the link has not listed yet', async () => {
      const fresh = col('fresh', 'week');
      const deps = makeDeps({ collections: [root, fresh] });
      renderHook(() => useLinkedCollectionSync(deps));
      await emit(makeLink({ sections: [] }));
      expect(deps.collectionsApi.deleteCollection).not.toHaveBeenCalled();
    });

    it('keeps a sub-collection that is merely unlisted, and never lists a deleted one again', async () => {
      const hostSec = col('h1', 'week');
      linkDoc = makeLink({ sections: [], deletedSections: ['S-mon'] });
      const deps = makeDeps({ collections: [root, mon, hostSec] });
      renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      await waitFor(() =>
        expect(linkDoc.sections?.map((x) => x.id)).toEqual(['h1'])
      );
      expect(deps.collectionsApi.deleteCollection).toHaveBeenCalledWith(
        'mon',
        'move-to-parent'
      );
      expect(deps.collectionsApi.deleteCollection).toHaveBeenCalledTimes(1);
    });

    it('a moved-in sub-collection that was once removed is listed again', async () => {
      const outside = col('mon', 'elsewhere', 'S-mon');
      linkDoc = makeLink({
        sections: [sections[1]],
        deletedSections: ['S-mon'],
      });
      const deps = makeDeps({ collections: [root, outside, tue] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      const move = vi.fn(() => {
        expect(linkDoc.deletedSections).toEqual([]);
        return Promise.resolve();
      });
      await act(async () => {
        await result.current.moveCollectionSynced('mon', 'week', move);
      });
      expect(move).toHaveBeenCalled();
    });

    it('holds a rename from before its write starts', async () => {
      linkDoc = makeLink({
        boards: [{ shareId: 's1', name: 'Old', order: 0 }],
      });
      const deps = makeDeps({
        dashboards: [
          board('a', 'week', { ...live('s1', 'collaborator'), name: 'New' }),
        ],
      });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      let release: () => void = () => undefined;
      act(() => {
        release = result.current.holdBoardName('a', 'New');
      });
      await emit(linkDoc);
      expect(deps.renameBoard).not.toHaveBeenCalled();
      act(() => release());
      await emit(
        makeLink({ boards: [{ shareId: 's1', name: 'Old', order: 0 }] })
      );
      expect(deps.renameBoard).toHaveBeenCalledWith('a', 'Old');
    });

    it('takes another member’s later rename once ours has landed', async () => {
      linkDoc = makeLink({
        boards: [{ shareId: 's1', name: 'Old', order: 0 }],
      });
      const deps = makeDeps({
        dashboards: [
          board('a', 'week', { ...live('s1', 'collaborator'), name: 'Mine' }),
        ],
      });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      vi.mocked(deps.renameBoard).mockClear();
      await act(async () => {
        await result.current.pushBoardName('a', 'Mine');
      });
      // Their write follows ours; we never see our own name listed.
      await emit(
        makeLink({
          boards: [{ shareId: 's1', name: 'Theirs', order: 0 }],
          updatedBy: 'host',
        })
      );
      expect(deps.renameBoard).toHaveBeenCalledWith('a', 'Theirs');
    });

    it('deleting a parent and its child together keeps the link consistent', async () => {
      const inner = col('inner', 'mon', 'S-inner');
      linkDoc = makeLink({
        sections: [
          sections[0],
          { id: 'S-inner', name: 'inner', parentId: 'S-mon', order: 0 },
          sections[1],
        ],
        boards: [{ shareId: 's1', name: 's1', order: 0, sectionId: 'S-inner' }],
      });
      const deps = makeDeps({ collections: [root, mon, inner, tue] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      const remove = vi.fn(() => Promise.resolve());
      await act(async () => {
        await Promise.all([
          result.current.deleteCollectionSynced(
            'mon',
            'move-to-parent',
            remove
          ),
          result.current.deleteCollectionSynced(
            'inner',
            'move-to-parent',
            remove
          ),
        ]);
      });
      expect(linkDoc.sections?.map((x) => x.id)).toEqual(['S-tue']);
      expect(linkDoc.boards[0].sectionId).toBeUndefined();
      expect(linkDoc.deletedSections).toEqual(['S-mon', 'S-inner']);
    });

    it('moves a sub-collection where the link puts it', async () => {
      const deps = makeDeps({ collections: [root, mon, tue] });
      renderHook(() => useLinkedCollectionSync(deps));
      await emit(
        makeLink({
          sections: [sections[0], { ...sections[1], parentId: 'S-mon' }],
        })
      );
      expect(deps.collectionsApi.moveCollection).toHaveBeenCalledWith(
        'tue',
        'mon'
      );
    });

    it('lists a local sub-collection move before making it', async () => {
      linkDoc = makeLink({ sections });
      const deps = makeDeps({ collections: [root, mon, tue] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      const move = vi.fn(() => {
        expect(linkDoc.sections?.[1].parentId).toBe('S-mon');
        return Promise.resolve();
      });
      await act(async () => {
        await result.current.moveCollectionSynced('tue', 'mon', move);
      });
      expect(move).toHaveBeenCalled();
      expect(linkDoc.sections?.[1]).toMatchObject({
        id: 'S-tue',
        parentId: 'S-mon',
      });
    });

    it('deleting a sub-collection drops it from the list and hands its boards to the parent', async () => {
      linkDoc = makeLink({
        sections,
        boards: [{ shareId: 's1', name: 's1', order: 0, sectionId: 'S-mon' }],
      });
      const deps = makeDeps({
        collections: [root, mon, tue],
        dashboards: [board('s1', 'mon', live('s1', 'collaborator'))],
      });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      const remove = vi.fn(() => Promise.resolve());
      await act(async () => {
        await result.current.deleteCollectionSynced(
          'mon',
          'move-to-parent',
          remove
        );
      });
      expect(remove).toHaveBeenCalled();
      expect(linkDoc.sections?.map((s) => s.id)).toEqual(['S-tue']);
      expect(linkDoc.boards[0].sectionId).toBeUndefined();
      expect(linkDoc.deletedSections).toEqual(['S-mon']);
    });

    it('a viewer deletes a sub-collection only on their own copy', async () => {
      linkDoc = makeLink({
        mode: 'view-only',
        participants: { me: { role: 'viewer', joinedAt: 1 } },
        sections,
      });
      const deps = makeDeps({ collections: [root, mon, tue] });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      const remove = vi.fn(() => Promise.resolve());
      await act(async () => {
        await result.current.deleteCollectionSynced(
          'mon',
          'move-to-parent',
          remove
        );
      });
      expect(remove).toHaveBeenCalled();
      expect(linkDoc.sections).toHaveLength(2);
    });

    it('moving a sub-collection out takes its boards out for everyone and keeps them for the mover', async () => {
      shares.set('s1', share('s1'));
      linkDoc = makeLink({
        sections,
        boards: [
          { shareId: 's1', name: 's1', order: 0, sectionId: 'S-mon' },
          { shareId: 's2', name: 's2', order: 1 },
        ],
      });
      const deps = makeDeps({
        collections: [root, mon, tue],
        dashboards: [
          board('s1', 'mon', live('s1', 'collaborator')),
          board('s2', 'week', live('s2', 'collaborator')),
        ],
      });
      const { result } = renderHook(() => useLinkedCollectionSync(deps));
      await emit(linkDoc);
      expect(result.current.countCollectionMoveRemovals('mon', null)).toBe(1);
      expect(result.current.countCollectionMoveRemovals('mon', 'tue')).toBe(0);
      const move = vi.fn(() => {
        // The move lands before the list changes, so no tab sees a dropped board still inside.
        expect(linkDoc.boards).toHaveLength(2);
        return Promise.resolve();
      });
      await act(async () => {
        await result.current.moveCollectionSynced('mon', null, move);
      });
      expect(linkDoc.boards.map((b) => b.shareId)).toEqual(['s2']);
      expect(linkDoc.sections?.map((s) => s.id)).toEqual(['S-tue']);
      expect(deps.leaveSharedBoard).toHaveBeenCalledWith('s1');
      expect(deps.setBoardLink).toHaveBeenCalledWith('s1', null);
      expect(linkDoc.deletedSections).toEqual(['S-mon']);
    });
  });
});

describe('useLinkedCollectionSync: Stop sharing, Leave and ended links', () => {
  const hostRoot: Collection = { ...root, linkedCollectionRole: 'owner' };
  const viewerRoot: Collection = { ...root, linkedCollectionRole: 'viewer' };
  const listed = [
    { shareId: 's1', name: 'Mon', order: 0 },
    { shareId: 'L1_mine', name: 'Tue', order: 1 },
  ];

  it('keeps a Synced member’s boards as their own when the host stops', async () => {
    const deps = makeDeps({
      dashboards: [
        board('linked-s1', 'week', live('s1', 'collaborator')),
        board('mine', 'week', live('L1_mine', 'owner')),
        board('solo', 'week', live('solo-share', 'owner')),
      ],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: listed, ended: true }));
    await waitFor(() =>
      expect(deps.collectionsApi.setCollectionLink).toHaveBeenCalledWith(
        'week',
        {
          linkedCollectionId: 'L1',
          linkedCollectionRole: 'collaborator',
          linkedCollectionEnded: true,
        }
      )
    );
    expect(deps.setBoardLink).toHaveBeenCalledWith('linked-s1', null);
    expect(deps.setBoardLink).toHaveBeenCalledWith('mine', null);
    expect(deps.setBoardLink).not.toHaveBeenCalledWith('solo', null);
    expect(deps.deleteBoard).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(
      'Host stopped sharing this collection.'
    );
  });

  it('removes a View-Only member’s copy, and the collection when nothing else is in it', async () => {
    const deps = makeDeps({
      collections: [viewerRoot],
      dashboards: [board('linked-s1', 'week', live('s1', 'viewer'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        mode: 'view-only',
        hostName: null,
        participants: { me: { role: 'viewer', joinedAt: 1 } },
        boards: [listed[0]],
        ended: true,
      })
    );
    await waitFor(() =>
      expect(deps.collectionsApi.deleteCollection).toHaveBeenCalledWith(
        'week',
        'delete-all'
      )
    );
    expect(deps.deleteBoard).toHaveBeenCalledWith('linked-s1');
    expect(deps.notify).toHaveBeenCalledWith(
      'The host stopped sharing this collection.'
    );
  });

  it('keeps a View-Only member’s collection when their own boards are in it', async () => {
    const deps = makeDeps({
      collections: [viewerRoot],
      dashboards: [
        board('linked-s1', 'week', live('s1', 'viewer')),
        board('own', 'week'),
      ],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        mode: 'view-only',
        participants: { me: { role: 'viewer', joinedAt: 1 } },
        boards: [listed[0]],
        ended: true,
      })
    );
    await waitFor(() =>
      expect(deps.collectionsApi.setCollectionLink).toHaveBeenCalled()
    );
    expect(deps.deleteBoard).toHaveBeenCalledWith('linked-s1');
    expect(deps.deleteBoard).not.toHaveBeenCalledWith('own');
    expect(deps.collectionsApi.deleteCollection).not.toHaveBeenCalled();
  });

  it('closes quietly for a member no longer in the link, but only on a server snapshot', async () => {
    const deps = makeDeps({
      dashboards: [board('linked-s1', 'week', live('s1', 'collaborator'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: listed, participants: {} }), true);
    expect(deps.collectionsApi.setCollectionLink).not.toHaveBeenCalled();
    await emit(makeLink({ boards: listed, participants: {} }));
    await waitFor(() =>
      expect(deps.collectionsApi.setCollectionLink).toHaveBeenCalled()
    );
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('treats a deleted link as ended, but not a cached miss', async () => {
    const deps = makeDeps({
      dashboards: [board('linked-s1', 'week', live('s1', 'collaborator'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await act(async () => {
      linkCb?.(null, { fromCache: true });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(deps.setBoardLink).not.toHaveBeenCalled();
    await act(async () => {
      linkCb?.(null, { fromCache: false });
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() =>
      expect(deps.setBoardLink).toHaveBeenCalledWith('linked-s1', null)
    );
  });

  it('host Stop sharing ends the link and every listed board, and shares nothing again', async () => {
    const deps = makeDeps({
      collections: [hostRoot],
      dashboards: [
        board('a', 'week', live('L1_a', 'owner')),
        board('linked-s1', 'week', live('s1', 'collaborator')),
      ],
    });
    const { result } = renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        hostUid: 'me',
        participants: { other: { role: 'collaborator', joinedAt: 1 } },
        boards: [
          { shareId: 'L1_a', name: 'A', order: 0 },
          { shareId: 's1', name: 'B', order: 1 },
          { shareId: 'not-imported', name: 'C', order: 2 },
        ],
      })
    );
    await act(async () => {
      await result.current.stopSharingCollection('week');
    });
    expect(deps.linkedCollectionApi.endLinkedCollection).toHaveBeenCalledWith(
      'L1',
      'me'
    );
    expect(deps.setBoardLink).toHaveBeenCalledWith('a', null);
    expect(deps.setBoardLink).toHaveBeenCalledWith('linked-s1', null);
    expect(deps.collectionsApi.setCollectionLink).toHaveBeenCalledWith('week', {
      linkedCollectionId: 'L1',
      linkedCollectionRole: 'owner',
      linkedCollectionEnded: true,
    });
    expect(
      vi
        .mocked(deps.stopSharingBoard)
        .mock.calls.map((c) => c[0])
        .sort()
    ).toEqual(['L1_a', 'not-imported', 's1']);
    await emit({ ...linkDoc, ended: true });
    expect(deps.shareBoard).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('a failed Stop sharing changes nothing locally', async () => {
    const deps = makeDeps({
      collections: [hostRoot],
      dashboards: [board('a', 'week', live('L1_a', 'owner'))],
    });
    vi.mocked(deps.linkedCollectionApi.endLinkedCollection).mockRejectedValue(
      Object.assign(new Error('denied'), { code: 'permission-denied' })
    );
    const { result } = renderHook(() => useLinkedCollectionSync(deps));
    await expect(result.current.stopSharingCollection('week')).rejects.toThrow(
      'denied'
    );
    expect(deps.setBoardLink).not.toHaveBeenCalled();
    expect(deps.stopSharingBoard).not.toHaveBeenCalled();
    expect(deps.collectionsApi.setCollectionLink).not.toHaveBeenCalled();
  });

  it('a Synced member who leaves keeps copies and leaves the boards they joined', async () => {
    const deps = makeDeps({
      dashboards: [
        board('linked-s1', 'week', live('s1', 'collaborator')),
        board('mine', 'week', live('L1_mine', 'owner')),
      ],
    });
    const { result } = renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: listed }));
    await act(async () => {
      await result.current.leaveSharedCollection('week');
    });
    expect(deps.linkedCollectionApi.leaveLinkedCollection).toHaveBeenCalledWith(
      'L1',
      'me'
    );
    expect(deps.leaveSharedBoard).toHaveBeenCalledWith('s1');
    expect(deps.leaveSharedBoard).not.toHaveBeenCalledWith('L1_mine');
    // The board they added stays shared, so the others keep it.
    expect(deps.stopSharingBoard).not.toHaveBeenCalled();
    expect(deps.setBoardLink).toHaveBeenCalledWith('linked-s1', null);
    expect(deps.setBoardLink).toHaveBeenCalledWith('mine', null);
    expect(deps.collectionsApi.setCollectionLink).toHaveBeenCalledWith(
      'week',
      expect.objectContaining({ linkedCollectionEnded: true })
    );
    await emit({ ...linkDoc, participants: {} });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('a View-Only member who leaves loses the copy', async () => {
    const deps = makeDeps({
      collections: [viewerRoot],
      dashboards: [board('linked-s1', 'week', live('s1', 'viewer'))],
    });
    const { result } = renderHook(() => useLinkedCollectionSync(deps));
    await act(async () => {
      await result.current.leaveSharedCollection('week');
    });
    expect(deps.leaveSharedBoard).toHaveBeenCalledWith('s1');
    expect(deps.deleteBoard).toHaveBeenCalledWith('linked-s1');
    expect(deps.collectionsApi.deleteCollection).toHaveBeenCalledWith(
      'week',
      'delete-all'
    );
  });

  it('the host cannot leave, and a member cannot stop sharing', async () => {
    const host = makeDeps({ collections: [hostRoot] });
    const { result: h } = renderHook(() => useLinkedCollectionSync(host));
    await expect(h.current.leaveSharedCollection('week')).rejects.toThrow();
    const member = makeDeps();
    const { result: m } = renderHook(() => useLinkedCollectionSync(member));
    await expect(m.current.stopSharingCollection('week')).rejects.toThrow();
    expect(
      member.linkedCollectionApi.endLinkedCollection
    ).not.toHaveBeenCalled();
  });

  it('another host tab ends every listed board when it sees the link ended', async () => {
    const deps = makeDeps({
      collections: [hostRoot],
      dashboards: [board('a', 'week', live('L1_a', 'owner'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await emit(
      makeLink({
        hostUid: 'me',
        participants: {},
        boards: [
          { shareId: 'L1_a', name: 'A', order: 0 },
          { shareId: 'collab-board', name: 'B', order: 1 },
        ],
        ended: true,
      })
    );
    await waitFor(() =>
      expect(
        vi
          .mocked(deps.stopSharingBoard)
          .mock.calls.map((c) => c[0])
          .sort()
      ).toEqual(['L1_a', 'collab-board'])
    );
    expect(deps.setBoardLink).toHaveBeenCalledWith('a', null);
  });

  it('a Leave retried after the server write landed skips the write and finishes closing', async () => {
    const deps = makeDeps({
      dashboards: [board('linked-s1', 'week', live('s1', 'collaborator'))],
    });
    vi.mocked(deps.collectionsApi.setCollectionLink)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useLinkedCollectionSync(deps));
    await emit(makeLink({ boards: listed }));
    await act(async () => {
      await expect(
        result.current.leaveSharedCollection('week')
      ).rejects.toThrow('offline');
    });
    // The server now shows this teacher out of the link.
    await emit({ ...linkDoc, participants: {} }, true);
    await act(async () => {
      await result.current.leaveSharedCollection('week');
    });
    expect(
      deps.linkedCollectionApi.leaveLinkedCollection
    ).toHaveBeenCalledTimes(1);
    expect(deps.collectionsApi.setCollectionLink).toHaveBeenCalledTimes(2);
  });

  it('skips a queued close when a later snapshot shows the link live again', async () => {
    const deps = makeDeps({
      dashboards: [board('linked-s1', 'week', live('s1', 'collaborator'))],
    });
    renderHook(() => useLinkedCollectionSync(deps));
    await act(async () => {
      linkCb?.(makeLink({ boards: listed, participants: {} }), {
        fromCache: false,
      });
      linkCb?.(makeLink({ boards: listed }), { fromCache: false });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(deps.collectionsApi.setCollectionLink).not.toHaveBeenCalled();
  });
});
