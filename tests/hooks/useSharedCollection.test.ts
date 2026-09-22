import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('firebase/firestore', () => {
  const docs = new Map<string, unknown>();
  const deletedPaths: string[] = [];
  // When set, the next getDoc/getDocs call rejects with this error, then
  // auto-clears. Used to drive the discriminated failure paths in
  // loadSharedCollection / loadSharedCollectionBoards.
  let nextGetDocError: unknown = null;
  let nextGetDocsError: unknown = null;

  return {
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
    })),
    getDoc: vi.fn((ref: { path: string }) => {
      if (nextGetDocError !== null) {
        const err = nextGetDocError;
        nextGetDocError = null;
        // Firestore SDK rejections are not necessarily Error instances
        // (e.g. `{ code: 'permission-denied' }`). The hook reads `.code`
        // off `unknown`, so the test must be able to reject with the
        // same shape — disable the lint rule that requires Error here.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(err);
      }
      return Promise.resolve({
        exists: () => docs.has(ref.path),
        data: () => docs.get(ref.path),
      });
    }),
    getDocs: vi.fn((ref: { path: string }) => {
      if (nextGetDocsError !== null) {
        const err = nextGetDocsError;
        nextGetDocsError = null;
        // See getDoc above.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(err);
      }
      return Promise.resolve({
        docs: Array.from(docs.entries())
          .filter(([path]) => path.startsWith(`${ref.path}/`))
          .map(([path, data]) => ({
            id: path.split('/').at(-1) ?? '',
            data: () => data,
          })),
      });
    }),
    deleteDoc: vi.fn((ref: { path: string }) => {
      deletedPaths.push(ref.path);
      docs.delete(ref.path);
      return Promise.resolve(undefined);
    }),
    // `query`/`where` are pass-throughs: the mock has no query engine, so
    // listHostSubShares' hostUid filter is not exercised here — its mode and
    // expiry filtering is.
    query: vi.fn((ref: unknown) => ref),
    where: vi.fn(() => ({})),
    writeBatch: vi.fn(() => {
      const staged: Array<[string, unknown, 'set' | 'update' | 'delete']> = [];
      return {
        set: vi.fn((ref: { path: string }, data: unknown) => {
          staged.push([ref.path, data, 'set']);
        }),
        update: vi.fn((ref: { path: string }, data: unknown) => {
          staged.push([ref.path, data, 'update']);
        }),
        delete: vi.fn((ref: { path: string }) => {
          staged.push([ref.path, null, 'delete']);
        }),
        commit: vi.fn(() => {
          for (const [p, d, op] of staged) {
            if (op === 'delete') {
              deletedPaths.push(p);
              docs.delete(p);
            } else if (op === 'update') {
              docs.set(p, {
                ...(docs.get(p) as Record<string, unknown> | undefined),
                ...(d as Record<string, unknown>),
              });
            } else {
              docs.set(p, d);
            }
          }
          return Promise.resolve(undefined);
        }),
      };
    }),
    Timestamp: { now: () => ({ toMillis: () => 1000 }) },
    __testHelpers: {
      docs,
      deletedPaths,
      reset: () => {
        docs.clear();
        deletedPaths.length = 0;
        nextGetDocError = null;
        nextGetDocsError = null;
      },
      failNextGetDoc: (err: unknown) => {
        nextGetDocError = err;
      },
      failNextGetDocs: (err: unknown) => {
        nextGetDocsError = err;
      },
    },
  };
});

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { useSharedCollection } from '@/hooks/useSharedCollection';
import type { Collection, Dashboard } from '@/types';

type FirestoreMockHelpers = {
  docs: Map<string, unknown>;
  deletedPaths: string[];
  reset: () => void;
  failNextGetDoc: (err: unknown) => void;
  failNextGetDocs: (err: unknown) => void;
};

const getHelpers = async (): Promise<FirestoreMockHelpers> => {
  const mod = (await vi.importMock('firebase/firestore')) as {
    __testHelpers: FirestoreMockHelpers;
  };
  return mod.__testHelpers;
};

const dashboard = (id: string): Dashboard => ({
  id,
  name: `Board ${id}`,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  collectionId: 'src-collection',
});

const dashboardWithNames = (id: string): Dashboard => ({
  ...dashboard(id),
  widgets: [
    {
      id: 'w1',
      type: 'random',
      position: { x: 0, y: 0 },
      config: {
        firstNames: 'Alice\nBob',
        lastNames: 'Smith\nJones',
        lastResult: { picked: 'Alice Smith' },
        mode: 'pick',
      },
    },
  ] as unknown as Dashboard['widgets'],
});

const sourceCollection = (): Collection => ({
  id: 'src-collection',
  name: 'Source',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  color: '#ad2122',
});

describe('useSharedCollection', () => {
  beforeEach(async () => {
    const helpers = await getHelpers();
    helpers.reset();
  });

  it('shareCollection writes parent + N boards and returns a shareId', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const shareId = await result.current.shareCollection({
      collection: sourceCollection(),
      boards: [dashboard('b1'), dashboard('b2')],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
    });
    expect(shareId).toMatch(/^[0-9a-f-]{36}$/);
    const helpers = await getHelpers();
    const parent = helpers.docs.get(`shared_collections/${shareId}`) as {
      boardIds: string[];
      intendedMode: string;
    };
    expect(parent.boardIds).toEqual(['b1', 'b2']);
    expect(parent.intendedMode).toBe('copy');
    expect(helpers.docs.has(`shared_collections/${shareId}/boards/b1`)).toBe(
      true
    );
    expect(helpers.docs.has(`shared_collections/${shareId}/boards/b2`)).toBe(
      true
    );
  });

  it('shareSubstituteCollection sets intendedMode=substitute + expiresAt', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const shareId = await result.current.shareSubstituteCollection({
      collection: sourceCollection(),
      boards: [dashboard('b1')],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
      collectionId: 'src-collection',
      sourceId: 'src-collection',
      expiresAt: 9999999999999,
      buildingId: 'middle-school',
      ...tree(),
    });
    const helpers = await getHelpers();
    const parent = helpers.docs.get(`shared_collections/${shareId}`) as {
      intendedMode: string;
      expiresAt: number;
      buildingId: string;
    };
    expect(parent.intendedMode).toBe('substitute');
    expect(parent.expiresAt).toBe(9999999999999);
    expect(parent.buildingId).toBe('middle-school');
  });

  it('scrubs student names from shared board snapshots', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const boards = [dashboardWithNames('b1')];
    const copyId = await result.current.shareCollection({
      collection: sourceCollection(),
      boards,
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
    });
    const subId = await result.current.shareSubstituteCollection({
      collection: sourceCollection(),
      boards,
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
      collectionId: 'src-collection',
      sourceId: 'src-collection',
      expiresAt: 9999999999999,
      buildingId: 'middle-school',
      ...tree(),
    });

    const helpers = await getHelpers();
    for (const shareId of [copyId, subId]) {
      const written = helpers.docs.get(
        `shared_collections/${shareId}/boards/b1`
      ) as { dashboard: Dashboard };
      const config = written.dashboard.widgets[0].config as Record<
        string,
        unknown
      >;
      expect(config.firstNames).toBeUndefined();
      expect(config.lastNames).toBeUndefined();
      expect(config.lastResult).toBeUndefined();
      expect(config.mode).toBe('pick');
    }
    // The host's in-memory board keeps its names.
    expect(
      (boards[0].widgets[0].config as Record<string, unknown>).firstNames
    ).toBe('Alice\nBob');
  });

  it('shareCollection cleans up the parent doc when a board batch fails', async () => {
    const helpers = await getHelpers();
    // The hook calls writeBatch twice: once for the parent doc, then again
    // for the board batch. Let parent succeed, then fail the boards commit
    // to drive the partial-write recovery path in commitBoardBatches.
    const fsMod = (await vi.importMock('firebase/firestore')) as {
      writeBatch: ReturnType<typeof vi.fn>;
    };
    // Parent batch — commits successfully.
    fsMod.writeBatch.mockImplementationOnce(() => {
      const staged: Array<[string, unknown]> = [];
      return {
        set: vi.fn((ref: { path: string }, data: unknown) => {
          staged.push([ref.path, data]);
        }),
        commit: vi.fn(() => {
          for (const [p, d] of staged) helpers.docs.set(p, d);
          return Promise.resolve(undefined);
        }),
      };
    });
    // Board batch — commit rejects (simulates a Firestore-rules denial
    // mid-share after the parent has already landed).
    fsMod.writeBatch.mockImplementationOnce(() => ({
      set: vi.fn(),
      commit: vi.fn(() => Promise.reject(new Error('rules denied write'))),
    }));

    const { result } = renderHook(() => useSharedCollection());
    await expect(
      result.current.shareCollection({
        collection: sourceCollection(),
        boards: [dashboard('b1'), dashboard('b2')],
        hostUid: 'host-uid',
        hostDisplayName: 'Mr. Teacher',
      })
    ).rejects.toThrow(/Failed to upload all boards/);

    // commitBoardBatches' cleanup deleted the parent doc so the recipient
    // sees "not-found" rather than a half-populated share.
    expect(
      helpers.deletedPaths.some((p) => p.startsWith('shared_collections/'))
    ).toBe(true);
  });

  const tree = () => ({
    kind: 'collection' as const,
    sections: [{ id: 'src-collection', name: 'Source' }],
    boardEntries: [
      { id: 'b1', name: 'Warm-up', sectionId: 'src-collection', order: 0 },
      { id: 'b2', name: 'Lesson', sectionId: 'src-collection', order: 1 },
    ],
    defaultBoardId: 'b1',
  });

  const helpersDeletedParent = (
    helpers: { deletedPaths: string[] },
    shareId: string
  ) => helpers.deletedPaths.includes(`shared_collections/${shareId}`);

  const seedSubShare = async () => {
    const { result } = renderHook(() => useSharedCollection());
    const shareId = await result.current.shareSubstituteCollection({
      collection: sourceCollection(),
      boards: [dashboard('b1'), dashboard('b2')],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
      collectionId: 'src-collection',
      sourceId: 'src-collection',
      expiresAt: 9999999999999,
      buildingId: 'middle-school',
      ...tree(),
    });
    return { shareId, api: result.current };
  };

  it('shareSubstituteCollection writes the walk order, sections and version', async () => {
    const { shareId } = await seedSubShare();
    const helpers = await getHelpers();
    const parent = helpers.docs.get(`shared_collections/${shareId}`) as {
      kind: string;
      sections: { id: string }[];
      boards: { id: string; name: string; order: number }[];
      defaultBoardId: string;
      contentVersion: number;
      updatedAt: number;
    };
    expect(parent.kind).toBe('collection');
    expect(parent.sections).toEqual([{ id: 'src-collection', name: 'Source' }]);
    expect(parent.boards.map((b) => b.name)).toEqual(['Warm-up', 'Lesson']);
    expect(parent.defaultBoardId).toBe('b1');
    expect(parent.contentVersion).toBe(1);
    expect(parent.updatedAt).toBeGreaterThan(0);
  });

  it('a substitute snapshot keeps the pen marks a copy share drops', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const inked = {
      ...dashboard('b1'),
      annotationOverlay: { objects: [{ id: 'stroke-1' }] },
    } as unknown as Dashboard;
    const subId = await result.current.shareSubstituteCollection({
      collection: sourceCollection(),
      boards: [inked],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
      collectionId: 'src-collection',
      sourceId: 'src-collection',
      expiresAt: 9999999999999,
      buildingId: 'middle-school',
      ...tree(),
    });
    const copyId = await result.current.shareCollection({
      collection: sourceCollection(),
      boards: [inked],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
    });
    const helpers = await getHelpers();
    const read = (shareId: string) =>
      (
        helpers.docs.get(`shared_collections/${shareId}/boards/b1`) as {
          dashboard: Dashboard;
        }
      ).dashboard;
    expect(read(subId).annotationOverlay).toEqual({
      objects: [{ id: 'stroke-1' }],
    });
    expect(read(copyId).annotationOverlay).toBeUndefined();
  });

  it('updateSubstituteShare bumps the version and drops removed boards', async () => {
    const { shareId, api } = await seedSubShare();
    await api.updateSubstituteShare({
      shareId,
      collection: sourceCollection(),
      boards: [dashboard('b1')],
      kind: 'collection',
      sections: [{ id: 'src-collection', name: 'Source' }],
      boardEntries: [
        { id: 'b1', name: 'Warm-up', sectionId: 'src-collection', order: 0 },
      ],
      defaultBoardId: 'b1',
    });
    const helpers = await getHelpers();
    const parent = helpers.docs.get(`shared_collections/${shareId}`) as {
      boardIds: string[];
      contentVersion: number;
      expiresAt: number;
    };
    expect(parent.boardIds).toEqual(['b1']);
    expect(parent.contentVersion).toBe(2);
    // Untouched fields survive the update.
    expect(parent.expiresAt).toBe(9999999999999);
    expect(
      helpers.deletedPaths.includes(`shared_collections/${shareId}/boards/b2`)
    ).toBe(true);
    expect(helpers.docs.has(`shared_collections/${shareId}/boards/b1`)).toBe(
      true
    );
  });

  // A half-finished re-push leaves the share standing, so the message must
  // not tell the teacher it was cancelled.
  it('updateSubstituteShare says the share is still live when a board batch fails', async () => {
    const { shareId, api } = await seedSubShare();
    const fsMod = (await vi.importMock('firebase/firestore')) as {
      writeBatch: ReturnType<typeof vi.fn>;
    };
    // Parent batch commits; the board batch that follows it rejects.
    fsMod.writeBatch.mockImplementationOnce(() => ({
      update: vi.fn(),
      set: vi.fn(),
      commit: vi.fn(() => Promise.resolve(undefined)),
    }));
    fsMod.writeBatch.mockImplementationOnce(() => ({
      set: vi.fn(),
      commit: vi.fn(() => Promise.reject(new Error('rules denied write'))),
    }));

    await expect(
      api.updateSubstituteShare({
        shareId,
        collection: sourceCollection(),
        boards: [dashboard('b1')],
        kind: 'collection',
        sections: [{ id: 'src-collection', name: 'Source' }],
        boardEntries: [
          { id: 'b1', name: 'Warm-up', sectionId: 'src-collection', order: 0 },
        ],
      })
    ).rejects.toThrow(/still has the share/);
    // And the share itself is left standing for the retry.
    expect(helpersDeletedParent(await getHelpers(), shareId)).toBe(false);
  });

  // A grant the update no longer resolves is still a live Drive permission,
  // and only the ledger tells the expiry sweep to take it back.
  it('updateSubstituteShare keeps grant records it no longer resolves', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const shareId = await result.current.shareSubstituteCollection({
      collection: sourceCollection(),
      boards: [dashboard('b1')],
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
      collectionId: 'src-collection',
      sourceId: 'src-collection',
      expiresAt: 9999999999999,
      buildingId: 'middle-school',
      ...tree(),
      driveGrants: [
        {
          email: 'sub-a@orono.k12.mn.us',
          fileId: 'file-1',
          permissionId: 'p1',
        },
      ],
    });
    await result.current.updateSubstituteShare({
      shareId,
      collection: sourceCollection(),
      boards: [dashboard('b1')],
      kind: 'collection',
      sections: [{ id: 'src-collection', name: 'Source' }],
      boardEntries: [
        { id: 'b1', name: 'Warm-up', sectionId: 'src-collection', order: 0 },
      ],
      driveGrants: [
        {
          email: 'sub-b@orono.k12.mn.us',
          fileId: 'file-1',
          permissionId: 'p2',
        },
      ],
    });
    const helpers = await getHelpers();
    const parent = helpers.docs.get(`shared_collections/${shareId}`) as {
      driveGrants: { permissionId: string }[];
    };
    expect(parent.driveGrants.map((g) => g.permissionId)).toEqual(['p1', 'p2']);
  });

  it('extendSubstituteShare moves the expiry without touching the boards', async () => {
    const { shareId, api } = await seedSubShare();
    await api.extendSubstituteShare(shareId, 123456789);
    const helpers = await getHelpers();
    const parent = helpers.docs.get(`shared_collections/${shareId}`) as {
      expiresAt: number;
      boardIds: string[];
    };
    expect(parent.expiresAt).toBe(123456789);
    expect(parent.boardIds).toEqual(['b1', 'b2']);
  });

  it('expireSubstituteShare stamps the expiry in the past and keeps the docs', async () => {
    const { shareId, api } = await seedSubShare();
    await api.expireSubstituteShare(shareId);
    const helpers = await getHelpers();
    const parent = helpers.docs.get(`shared_collections/${shareId}`) as {
      expiresAt: number;
    };
    expect(parent.expiresAt).toBeLessThan(Date.now());
    // The sweep deletes them, once it has revoked the Drive grants.
    expect(helpers.docs.has(`shared_collections/${shareId}/boards/b1`)).toBe(
      true
    );
  });

  it('listHostSubShares skips copy shares and expired ones, newest first', async () => {
    const helpers = await getHelpers();
    helpers.docs.set('shared_collections/live-2', {
      shareId: 'live-2',
      hostUid: 'host-uid',
      intendedMode: 'substitute',
      expiresAt: Date.now() + 60_000,
      createdAt: 2,
      updatedAt: 20,
    });
    helpers.docs.set('shared_collections/live-1', {
      shareId: 'live-1',
      hostUid: 'host-uid',
      intendedMode: 'substitute',
      expiresAt: Date.now() + 60_000,
      createdAt: 1,
      updatedAt: 30,
    });
    helpers.docs.set('shared_collections/gone', {
      shareId: 'gone',
      hostUid: 'host-uid',
      intendedMode: 'substitute',
      expiresAt: Date.now() - 60_000,
      createdAt: 3,
    });
    helpers.docs.set('shared_collections/copy', {
      shareId: 'copy',
      hostUid: 'host-uid',
      intendedMode: 'copy',
      createdAt: 4,
    });
    const { result } = renderHook(() => useSharedCollection());
    const shares = await result.current.listHostSubShares('host-uid');
    expect(shares.map((s) => s.shareId)).toEqual(['live-1', 'live-2']);
  });

  it('loadSharedCollection returns not-found when parent doc is missing', async () => {
    const { result } = renderHook(() => useSharedCollection());
    const loaded = await result.current.loadSharedCollection('missing-id');
    expect(loaded).toEqual({ ok: false, reason: 'not-found' });
  });

  it('loadSharedCollection returns ok=true with meta for a valid copy share', async () => {
    const helpers = await getHelpers();
    helpers.docs.set('shared_collections/share-copy-1', {
      shareId: 'share-copy-1',
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Teacher',
      intendedMode: 'copy',
      collection: { name: 'Copy Share' },
      boardIds: ['b1'],
      createdAt: 100,
    });
    const { result } = renderHook(() => useSharedCollection());
    const loaded = await result.current.loadSharedCollection('share-copy-1');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.meta.intendedMode).toBe('copy');
      expect(loaded.meta.boardIds).toEqual(['b1']);
    }
  });

  it('loadSharedCollection returns ok=true for non-expired substitute share', async () => {
    const helpers = await getHelpers();
    helpers.docs.set('shared_collections/share-sub-1', {
      shareId: 'share-sub-1',
      hostUid: 'host-uid',
      hostDisplayName: 'Mr. Sub',
      intendedMode: 'substitute',
      collection: { name: 'Substitute Share' },
      boardIds: ['b1'],
      createdAt: 100,
      expiresAt: Date.now() + 86400000, // +1 day
      buildingId: 'middle-school',
    });
    const { result } = renderHook(() => useSharedCollection());
    const loaded = await result.current.loadSharedCollection('share-sub-1');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.meta.intendedMode).toBe('substitute');
      expect(loaded.meta.buildingId).toBe('middle-school');
    }
  });

  it('loadSharedCollection returns expired result for an expired substitute share', async () => {
    const helpers = await getHelpers();
    helpers.docs.set('shared_collections/expired', {
      shareId: 'expired',
      intendedMode: 'substitute',
      expiresAt: Date.now() - 1000,
      boardIds: [],
      collection: { name: 'gone' },
    });
    const { result } = renderHook(() => useSharedCollection());
    const loaded = await result.current.loadSharedCollection('expired');
    expect(loaded).toEqual({ ok: false, reason: 'expired' });
  });

  it('loadSharedCollection returns unauthorized when rules reject the read', async () => {
    const helpers = await getHelpers();
    helpers.failNextGetDoc({ code: 'permission-denied' });
    const { result } = renderHook(() => useSharedCollection());
    const loaded = await result.current.loadSharedCollection('blocked');
    expect(loaded).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('loadSharedCollection returns generic error reason on non-permission failure', async () => {
    const helpers = await getHelpers();
    helpers.failNextGetDoc(new Error('network unreachable'));
    const { result } = renderHook(() => useSharedCollection());
    const loaded = await result.current.loadSharedCollection('flaky');
    expect(loaded).toEqual({ ok: false, reason: 'error' });
  });

  it('loadSharedCollectionBoards returns boards in boardIds order', async () => {
    const helpers = await getHelpers();
    helpers.docs.set('shared_collections/s1/boards/b1', {
      boardId: 'b1',
      dashboard: dashboard('b1'),
    });
    helpers.docs.set('shared_collections/s1/boards/b2', {
      boardId: 'b2',
      dashboard: dashboard('b2'),
    });
    const { result } = renderHook(() => useSharedCollection());
    const boards = await result.current.loadSharedCollectionBoards('s1', [
      'b2',
      'b1',
    ]);
    expect(boards.map((b) => b.id)).toEqual(['b2', 'b1']);
  });

  it('loadSharedCollectionBoards filters boardIds that are missing from the subcollection', async () => {
    const helpers = await getHelpers();
    helpers.docs.set('shared_collections/s2/boards/b1', {
      boardId: 'b1',
      dashboard: dashboard('b1'),
    });
    const { result } = renderHook(() => useSharedCollection());
    const boards = await result.current.loadSharedCollectionBoards('s2', [
      'b1',
      'missing',
    ]);
    expect(boards.map((b) => b.id)).toEqual(['b1']);
  });

  it('loadSharedCollectionBoards returns [] when the getDocs query fails', async () => {
    const helpers = await getHelpers();
    helpers.failNextGetDocs(new Error('network unreachable'));
    const { result } = renderHook(() => useSharedCollection());
    const boards = await result.current.loadSharedCollectionBoards('s3', [
      'b1',
    ]);
    expect(boards).toEqual([]);
  });
});
