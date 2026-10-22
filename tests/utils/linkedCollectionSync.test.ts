import { describe, it, expect } from 'vitest';
import {
  canEditLinkedCollection,
  linkedRootOf,
  linkedTreeCollectionIds,
  planLocalSync,
  planRemoteSync,
} from '@/utils/linkedCollectionSync';
import type { Collection, Dashboard, LinkedCollection } from '@/types';

const col = (
  id: string,
  parentCollectionId: string | null,
  extra: Partial<Collection> = {}
): Collection => ({
  id,
  name: id,
  parentCollectionId,
  order: 0,
  createdAt: 0,
  ...extra,
});

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

const live = (
  shareId: string,
  role: Dashboard['linkedShareRole'] = 'collaborator'
) => ({
  linkedShareId: shareId,
  linkedShareRole: role,
  linkedShareEnded: false,
});

const link = (extra: Partial<LinkedCollection> = {}): LinkedCollection => ({
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

// Recipient's copy: root "week" imported from L1, sub-collection "mon" mirrors section S-mon.
const root = col('week', null, {
  name: 'Week',
  linkedCollectionId: 'L1',
  linkedCollectionRole: 'collaborator',
});
const mon = col('mon', 'week', { name: 'Monday', linkedSectionId: 'S-mon' });
const other = col('other', null);

describe('linkedTreeCollectionIds', () => {
  it('covers a live linked collection and its sub-collections only', () => {
    const ids = linkedTreeCollectionIds([root, mon, other]);
    expect([...ids].sort()).toEqual(['mon', 'week']);
  });

  it('skips an ended link', () => {
    const ended = { ...root, linkedCollectionEnded: true };
    expect(linkedTreeCollectionIds([ended, mon]).size).toBe(0);
  });
});

describe('linkedRootOf', () => {
  it('finds the linked collection a nested board sits in', () => {
    expect(linkedRootOf(board('b', 'mon'), [root, mon])?.id).toBe('week');
  });

  it('is undefined outside any linked collection', () => {
    expect(linkedRootOf(board('b', 'other'), [root, mon, other])).toBe(
      undefined
    );
  });
});

describe('canEditLinkedCollection', () => {
  it('lets the host and Synced collaborators edit, not viewers', () => {
    expect(canEditLinkedCollection(link(), 'host')).toBe(true);
    expect(canEditLinkedCollection(link(), 'me')).toBe(true);
    expect(
      canEditLinkedCollection(
        link({ participants: { me: { role: 'viewer', joinedAt: 1 } } }),
        'me'
      )
    ).toBe(false);
  });

  it('never lets a View-Only member edit, even with a collaborator entry', () => {
    expect(canEditLinkedCollection(link({ mode: 'view-only' }), 'me')).toBe(
      false
    );
    expect(canEditLinkedCollection(link({ mode: 'view-only' }), 'host')).toBe(
      true
    );
  });

  it('stops everyone once the link ends', () => {
    expect(canEditLinkedCollection(link({ ended: true }), 'host')).toBe(false);
  });
});

describe('planRemoteSync', () => {
  it('takes the shared name, color and icon', () => {
    const plan = planRemoteSync({
      link: link({ name: 'Week 2', color: '#123456', icon: 'BookOpen' }),
      root,
      collections: [root, mon],
      dashboards: [],
    });
    expect(plan.metadata).toEqual({
      name: 'Week 2',
      color: '#123456',
      icon: 'BookOpen',
    });
  });

  it('has nothing to change when the copy matches', () => {
    const plan = planRemoteSync({
      link: link({
        sections: [{ id: 'S-mon', name: 'Monday', parentId: null, order: 0 }],
        boards: [{ shareId: 's1', name: 'A', order: 0, sectionId: 'S-mon' }],
      }),
      root,
      collections: [root, mon],
      dashboards: [board('a', 'mon', live('s1'))],
    });
    expect(plan).toEqual({
      metadata: null,
      createSections: [],
      updateSections: [],
      missingEntries: [],
      removalCandidates: [],
      moves: [],
    });
  });

  it('creates new sections parents first and renames existing ones', () => {
    const plan = planRemoteSync({
      link: link({
        sections: [
          { id: 'S-child', name: 'Child', parentId: 'S-new', order: 0 },
          { id: 'S-new', name: 'New', parentId: null, order: 1 },
          { id: 'S-mon', name: 'Mon', parentId: null, order: 0 },
        ],
      }),
      root,
      collections: [root, mon],
      dashboards: [],
    });
    expect(plan.createSections.map((s) => s.id)).toEqual(['S-new', 'S-child']);
    expect(plan.updateSections).toEqual([
      { collectionId: 'mon', patch: { name: 'Mon' } },
    ]);
  });

  it('lists boards with no live local copy as missing', () => {
    const plan = planRemoteSync({
      link: link({
        boards: [
          { shareId: 's1', name: 'A', order: 0 },
          { shareId: 's2', name: 'B', order: 1 },
          { shareId: 's3', name: 'C', order: 2 },
        ],
      }),
      root,
      collections: [root, mon],
      dashboards: [
        board('a', 'week', live('s1')),
        // An ended copy doesn't count as having the board.
        board('c', 'week', { ...live('s3'), linkedShareEnded: true }),
      ],
    });
    expect(plan.missingEntries.map((e) => e.shareId)).toEqual(['s2', 's3']);
  });

  it('flags only live linked boards inside the collection that the link dropped', () => {
    const plan = planRemoteSync({
      link: link({ boards: [{ shareId: 's1', name: 'A', order: 0 }] }),
      root,
      collections: [root, mon, other],
      dashboards: [
        board('a', 'week', live('s1')),
        board('gone', 'mon', live('s9')),
        board('plain', 'week'),
        board('elsewhere', 'other', live('s8')),
      ],
    });
    expect(plan.removalCandidates.map((d) => d.id)).toEqual(['gone']);
  });

  it('moves a listed board to the sub-collection the link puts it in', () => {
    const plan = planRemoteSync({
      link: link({
        sections: [{ id: 'S-mon', name: 'Monday', parentId: null, order: 0 }],
        boards: [
          { shareId: 's1', name: 'A', order: 0, sectionId: 'S-mon' },
          { shareId: 's2', name: 'B', order: 1 },
        ],
      }),
      root,
      collections: [root, mon],
      dashboards: [
        board('a', 'week', live('s1')),
        board('b', 'mon', live('s2')),
      ],
    });
    expect(plan.moves).toEqual([
      { boardId: 'a', collectionId: 'mon' },
      { boardId: 'b', collectionId: 'week' },
    ]);
  });

  it('leaves a listed board alone once the teacher moved it out of the collection', () => {
    const plan = planRemoteSync({
      link: link({ boards: [{ shareId: 's1', name: 'A', order: 0 }] }),
      root,
      collections: [root, mon, other],
      dashboards: [board('a', 'other', live('s1'))],
    });
    expect(plan.moves).toEqual([]);
    expect(plan.missingEntries).toEqual([]);
  });

  it('falls back to the local name when the link has a blank one', () => {
    const plan = planRemoteSync({
      link: link({ name: '   ' }),
      root,
      collections: [root],
      dashboards: [],
    });
    expect(plan.metadata).toBe(null);
  });
});

describe('planLocalSync', () => {
  it('lists boards with no live share, in their sub-collection', () => {
    const plan = planLocalSync({
      link: link({
        sections: [{ id: 'S-mon', name: 'Monday', parentId: null, order: 0 }],
        boards: [{ shareId: 's1', name: 'A', order: 0 }],
      }),
      root,
      collections: [root, mon, other],
      dashboards: [
        board('a', 'week', live('s1')),
        board('new-top', 'week', { order: 1 }),
        board('new-mon', 'mon', { order: 2 }),
        board('outside', 'other'),
      ],
    });
    expect(plan.newSections).toEqual([]);
    expect(
      plan.boardsToShare.map(({ board: b, sectionId }) => [b.id, sectionId])
    ).toEqual([
      ['new-top', undefined],
      ['new-mon', 'S-mon'],
    ]);
  });

  it('re-lists a board whose share ended', () => {
    const plan = planLocalSync({
      link: link(),
      root,
      collections: [root],
      dashboards: [
        board('a', 'week', { ...live('s1'), linkedShareEnded: true }),
      ],
    });
    expect(plan.boardsToShare.map(({ board: b }) => b.id)).toEqual(['a']);
  });

  it('adds new local sub-collections, parents first, keyed by their own id', () => {
    const fresh = col('fresh', 'week', { name: 'Fresh', order: 1 });
    const nested = col('nested', 'fresh', { name: 'Nested' });
    const plan = planLocalSync({
      link: link({
        sections: [{ id: 'S-mon', name: 'Monday', parentId: null, order: 0 }],
      }),
      root,
      collections: [root, mon, fresh, nested],
      dashboards: [board('n', 'nested')],
    });
    expect(plan.newSections).toEqual([
      { id: 'fresh', name: 'Fresh', parentId: null, order: 1 },
      { id: 'nested', name: 'Nested', parentId: 'fresh', order: 0 },
    ]);
    expect(plan.boardsToShare[0].sectionId).toBe('nested');
  });

  it('matches the host’s own sub-collections by id', () => {
    const hostRoot = col('week', null, {
      linkedCollectionId: 'L1',
      linkedCollectionRole: 'owner',
    });
    const hostMon = col('host-mon', 'week');
    const plan = planLocalSync({
      link: link({
        sections: [
          { id: 'host-mon', name: 'Monday', parentId: null, order: 0 },
        ],
      }),
      root: hostRoot,
      collections: [hostRoot, hostMon],
      dashboards: [],
    });
    expect(plan.newSections).toEqual([]);
  });
});
