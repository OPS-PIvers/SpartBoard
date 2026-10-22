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
});
