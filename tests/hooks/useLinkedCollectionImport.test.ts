import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, LinkedCollection } from '@/types';
import type { SharedBoardSnapshot } from '@/hooks/useFirestore';

const createCollection = vi.fn();
const createNewDashboard =
  vi.fn<
    (
      name: string,
      data: Dashboard,
      opts: { collectionId?: string | null; silent?: boolean }
    ) => Promise<string>
  >();
const loadSharedDashboard = vi.fn();
const joinSharedBoard = vi.fn();
const joinLinkedCollection = vi.fn();

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'me', displayName: 'Me', email: 'me@example.com' },
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    collectionsApi: { collections: [], createCollection },
    createNewDashboard,
    dashboards: [],
  }),
}));
vi.mock('@/hooks/useFirestore', () => ({
  useFirestore: () => ({ loadSharedDashboard, joinSharedBoard }),
}));
vi.mock('@/hooks/useLinkedCollection', () => ({
  useLinkedCollection: () => ({ joinLinkedCollection }),
}));

const { useLinkedCollectionImport } =
  await import('@/hooks/useLinkedCollectionImport');

const link = (over: Partial<LinkedCollection> = {}): LinkedCollection => ({
  linkId: 'link-1',
  hostUid: 'host',
  hostName: 'Host',
  mode: 'synced',
  name: 'Unit 3',
  boards: [
    { shareId: 's-top', name: 'Top', order: 0 },
    { shareId: 's-nested', name: 'Nested', order: 1, sectionId: 'sec-1' },
    { shareId: 's-foreign', name: 'Foreign', order: 2 },
  ],
  sections: [{ id: 'sec-1', name: 'Week 1', parentId: null, order: 0 }],
  participants: {},
  createdAt: 1,
  updatedAt: 1,
  updatedBy: 'host',
  ...over,
});

const share = (
  id: string,
  over: Partial<SharedBoardSnapshot> = {}
): SharedBoardSnapshot => ({
  id,
  name: id,
  background: 'bg-slate-100',
  widgets: [],
  createdAt: 1,
  intendedMode: 'synced',
  linkedCollectionId: 'link-1',
  originalAuthor: 'host',
  ...over,
});

describe('useLinkedCollectionImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let n = 0;
    createCollection.mockImplementation(() => Promise.resolve(`col-${++n}`));
    createNewDashboard.mockImplementation((_name, data) =>
      Promise.resolve(`board-${data.linkedShareId ?? ''}`)
    );
    loadSharedDashboard.mockImplementation((id: string) =>
      Promise.resolve(
        id === 's-foreign'
          ? share(id, { linkedCollectionId: 'someone-elses-link' })
          : share(id)
      )
    );
    joinLinkedCollection.mockResolvedValue(undefined);
    joinSharedBoard.mockResolvedValue(undefined);
  });

  it('joins the link, rebuilds sections and imports only boards stamped with the link', async () => {
    const { result } = renderHook(() => useLinkedCollectionImport());
    const out = await result.current.importLinkedCollection(link());

    expect(joinLinkedCollection).toHaveBeenCalledWith(
      expect.objectContaining({ linkId: 'link-1' }),
      'me',
      'Me'
    );
    expect(createCollection).toHaveBeenNthCalledWith(
      1,
      'Unit 3',
      null,
      expect.objectContaining({
        linkedCollectionId: 'link-1',
        linkedCollectionRole: 'collaborator',
      })
    );
    expect(createCollection).toHaveBeenNthCalledWith(
      2,
      'Week 1',
      'col-1',
      expect.objectContaining({ linkedSectionId: 'sec-1' })
    );
    const placed = createNewDashboard.mock.calls.map(([, data, opts]) => [
      data.linkedShareId,
      opts.collectionId,
      data.linkedShareRole,
    ]);
    expect(placed).toEqual([
      ['s-top', 'col-1', 'collaborator'],
      ['s-nested', 'col-2', 'collaborator'],
    ]);
    expect(joinSharedBoard).toHaveBeenCalledTimes(2);
    expect(joinSharedBoard).not.toHaveBeenCalledWith(
      's-foreign',
      expect.anything(),
      expect.anything()
    );
    expect(out).toEqual({
      ok: true,
      collectionId: 'col-1',
      firstBoardId: 'board-s-top',
      imported: 2,
      failed: 1,
    });
  });

  it('a View-Only link imports viewer boards and refuses Synced shares', async () => {
    loadSharedDashboard.mockImplementation((id: string) =>
      Promise.resolve(
        share(id, { intendedMode: id === 's-top' ? 'view-only' : 'synced' })
      )
    );
    const { result } = renderHook(() => useLinkedCollectionImport());
    const out = await result.current.importLinkedCollection(
      link({ mode: 'view-only' })
    );
    expect(createNewDashboard).toHaveBeenCalledTimes(1);
    expect(createNewDashboard.mock.calls[0][1]).toMatchObject({
      linkedShareId: 's-top',
      linkedShareRole: 'viewer',
    });
    expect(joinSharedBoard).toHaveBeenCalledWith('s-top', 'viewer', 'Me');
    expect(out).toMatchObject({ ok: true, imported: 1, failed: 2 });
  });

  it('stops before any local write when the join is refused', async () => {
    joinLinkedCollection.mockRejectedValue({ code: 'permission-denied' });
    const { result } = renderHook(() => useLinkedCollectionImport());
    const out = await result.current.importLinkedCollection(link());
    expect(out).toEqual({ ok: false, reason: 'denied' });
    expect(createCollection).not.toHaveBeenCalled();
    expect(createNewDashboard).not.toHaveBeenCalled();
  });

  it('does not import an ended link', async () => {
    const { result } = renderHook(() => useLinkedCollectionImport());
    const out = await result.current.importLinkedCollection(
      link({ ended: true })
    );
    expect(out).toEqual({ ok: false, reason: 'ended' });
    expect(joinLinkedCollection).not.toHaveBeenCalled();
  });

  it('a returning member skips the join and keeps boards they authored as owner', async () => {
    loadSharedDashboard.mockImplementation((id: string) =>
      Promise.resolve(share(id, { originalAuthor: 'me' }))
    );
    const { result } = renderHook(() => useLinkedCollectionImport());
    await result.current.importLinkedCollection(
      link({
        participants: { me: { role: 'collaborator', joinedAt: 1 } },
        boards: [{ shareId: 's-top', name: 'Top', order: 0 }],
        sections: [],
      })
    );
    expect(joinLinkedCollection).not.toHaveBeenCalled();
    expect(joinSharedBoard).not.toHaveBeenCalled();
    expect(createNewDashboard.mock.calls[0][1]).toMatchObject({
      linkedShareRole: 'owner',
    });
  });
});

describe('useLinkedCollectionImport with no usable boards', () => {
  it('writes nothing when every listed share fails the trust check', async () => {
    vi.clearAllMocks();
    joinLinkedCollection.mockResolvedValue(undefined);
    loadSharedDashboard.mockResolvedValue(
      share('s-top', { linkedCollectionId: 'elsewhere' })
    );
    const { result } = renderHook(() => useLinkedCollectionImport());
    const out = await result.current.importLinkedCollection(link());
    expect(out).toEqual({ ok: false, reason: 'error' });
    expect(createCollection).not.toHaveBeenCalled();
    expect(createNewDashboard).not.toHaveBeenCalled();
  });

  it('an empty shared collection still imports', async () => {
    vi.clearAllMocks();
    joinLinkedCollection.mockResolvedValue(undefined);
    createCollection.mockResolvedValue('col-empty');
    const { result } = renderHook(() => useLinkedCollectionImport());
    const out = await result.current.importLinkedCollection(
      link({ boards: [], sections: [] })
    );
    expect(out).toMatchObject({
      ok: true,
      collectionId: 'col-empty',
      imported: 0,
    });
  });
});

describe('useLinkedCollectionImport with hostile names', () => {
  it('falls back to safe names instead of throwing', async () => {
    vi.clearAllMocks();
    joinLinkedCollection.mockResolvedValue(undefined);
    createCollection.mockResolvedValue('col-x');
    createNewDashboard.mockResolvedValue('board-x');
    loadSharedDashboard.mockResolvedValue(share('s-top'));
    const { result } = renderHook(() => useLinkedCollectionImport());
    const out = await result.current.importLinkedCollection(
      link({
        name: '   ',
        sections: [{ id: 'sec-1', name: '  ', parentId: null, order: 0 }],
        boards: [{ shareId: 's-top', name: '', order: 0, sectionId: 'sec-1' }],
      })
    );
    expect(out).toMatchObject({ ok: true, imported: 1 });
    expect(createCollection.mock.calls[0][0]).toBe('Shared collection');
    expect(createCollection.mock.calls[1][0]).toBe('Shared collection');
    expect(createNewDashboard.mock.calls[0][0]).toBe('s-top');
  });
});
