import { describe, it, expect } from 'vitest';
import {
  canEditLinkedCollection,
  linkedRootOf,
  linkedTreeCollectionIds,
  planLocalSync,
  planRemoteSync,
  linkedSubtreeKeys,
  sectionReparents,
  sectionsAfterMove,
  sectionsAfterRemove,
  subtreeSectionKeys,
  withDeletedSections,
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
      dashboards: [board('a', 'mon', { ...live('s1'), name: 'A' })],
    });
    expect(plan).toEqual({
      metadata: null,
      createSections: [],
      updateSections: [],
      missingEntries: [],
      removalCandidates: [],
      moves: [],
      staleSections: [],
      renames: [],
    });
  });

  it('takes a board name the link changed', () => {
    const plan = planRemoteSync({
      link: link({
        boards: [{ shareId: 's1', name: 'Day 1', order: 0 }],
      }),
      root,
      collections: [root],
      dashboards: [board('a', 'week', { ...live('s1'), name: 'Old' })],
    });
    expect(plan.renames).toEqual([{ boardId: 'a', name: 'Day 1' }]);
  });

  it('removes sub-collections the link records as deleted, deepest first, never unlisted new ones', () => {
    const inner = col('inner', 'mon', { linkedSectionId: 'S-inner' });
    const fresh = col('fresh', 'week');
    const plan = planRemoteSync({
      link: link({ sections: [], deletedSections: ['S-mon', 'S-inner'] }),
      root,
      collections: [root, mon, inner, fresh],
      dashboards: [],
    });
    expect(plan.staleSections.map((c) => c.id)).toEqual(['inner', 'mon']);
  });

  it('never re-creates a deleted section an old client listed again', () => {
    const plan = planRemoteSync({
      link: link({
        sections: [{ id: 'S-x', name: 'X', parentId: null, order: 0 }],
        deletedSections: ['S-x'],
      }),
      root,
      collections: [root],
      dashboards: [],
    });
    expect(plan.createSections).toEqual([]);
  });

  it('does not re-create a sub-collection this teacher moved out', () => {
    const movedOut = col('mon', null, { linkedSectionId: 'S-mon' });
    const plan = planRemoteSync({
      link: link({
        sections: [{ id: 'S-mon', name: 'Monday', parentId: null, order: 0 }],
      }),
      root,
      collections: [root, movedOut],
      dashboards: [],
    });
    expect(plan.createSections).toEqual([]);
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

  it('leaves a board whose share ended to the remote side', () => {
    const ended = board('a', 'week', { ...live('s1'), linkedShareEnded: true });
    expect(
      planLocalSync({
        link: link(),
        root,
        collections: [root],
        dashboards: [ended],
      }).boardsToShare
    ).toEqual([]);
    expect(
      planRemoteSync({
        link: link(),
        root,
        collections: [root],
        dashboards: [ended],
      }).removalCandidates.map((d) => d.id)
    ).toEqual(['a']);
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

  it('puts a new sub-collection after the last listed one when deletes left gaps', () => {
    const fresh = col('fresh', 'week', { name: 'Fresh' });
    const plan = planLocalSync({
      link: link({
        sections: [
          { id: 'S-a', name: 'A', parentId: null, order: 0 },
          { id: 'S-c', name: 'C', parentId: null, order: 5 },
        ],
      }),
      root,
      collections: [root, fresh],
      dashboards: [],
    });
    expect(plan.newSections.map((s) => s.order)).toEqual([6]);
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

describe('sub-collection list edits', () => {
  const sections = [
    { id: 'A', name: 'A', parentId: null, order: 0 },
    { id: 'B', name: 'B', parentId: 'A', order: 0 },
    { id: 'C', name: 'C', parentId: null, order: 1 },
  ];
  const boards = [
    { shareId: 's1', name: 'One', order: 0, sectionId: 'A' },
    { shareId: 's2', name: 'Two', order: 1, sectionId: 'B' },
    { shareId: 's3', name: 'Three', order: 2 },
  ];

  it('deleting a sub-collection hands its boards and children to its parent and records it', () => {
    const next = sectionsAfterRemove({ sections, boards }, new Set(['A']));
    expect(next.sections).toEqual([
      { id: 'B', name: 'B', parentId: null, order: 0 },
      { id: 'C', name: 'C', parentId: null, order: 1 },
    ]);
    expect(next.boards).toEqual([
      { shareId: 's1', name: 'One', order: 0 },
      { shareId: 's2', name: 'Two', order: 1, sectionId: 'B' },
      { shareId: 's3', name: 'Three', order: 2 },
    ]);
    expect(next.deletedSections).toEqual(['A']);
  });

  it('deleting a nested sub-collection hands its boards to the one above, read from the link', () => {
    const next = sectionsAfterRemove({ sections, boards }, new Set(['B']));
    expect(next.boards[1]).toEqual({
      shareId: 's2',
      name: 'Two',
      order: 1,
      sectionId: 'A',
    });
  });

  it('deleting a parent and child together hands boards to what stays above both', () => {
    const next = sectionsAfterRemove(
      { sections, boards, deletedSections: ['old'] },
      linkedSubtreeKeys(sections, 'A')
    );
    expect(next.sections).toEqual([sections[2]]);
    expect(next.boards.every((b) => !b.sectionId)).toBe(true);
    expect(next.deletedSections).toEqual(['old', 'A', 'B']);
  });

  it('keeps the deleted list to the newest 200', () => {
    const many = Array.from({ length: 200 }, (_, i) => `k${i}`);
    const next = withDeletedSections(many, ['new']);
    expect(next).toHaveLength(200);
    expect(next[0]).toBe('k1');
    expect(next[199]).toBe('new');
  });

  it('places listed sections under the parent the link names, including one created this pass', () => {
    const tue = col('tue', 'week', { linkedSectionId: 'S-tue' });
    const moves = sectionReparents({
      link: {
        sections: [
          { id: 'S-new', name: 'New', parentId: null, order: 0 },
          { id: 'S-tue', name: 'tue', parentId: 'S-new', order: 0 },
          { id: 'S-mon', name: 'Monday', parentId: null, order: 1 },
        ],
      },
      rootId: 'week',
      keyToLocal: new Map([
        ['S-new', 'created-now'],
        ['S-tue', 'tue'],
        ['S-mon', 'mon'],
      ]),
      collections: [root, mon, tue],
    });
    expect(moves).toEqual([{ collectionId: 'tue', parentId: 'created-now' }]);
  });

  it('a deleted section never lists again from local adds', () => {
    const plan = planLocalSync({
      link: link({ sections: [], deletedSections: ['S-mon'] }),
      root,
      collections: [root, mon],
      dashboards: [],
    });
    expect(plan.newSections).toEqual([]);
  });

  it('moving a sub-collection puts it last under its new parent', () => {
    expect(sectionsAfterMove(sections, 'C', 'A')).toEqual([
      sections[0],
      sections[1],
      { id: 'C', name: 'C', parentId: 'A', order: 1 },
    ]);
    expect(sectionsAfterMove(sections, 'missing', null)).toBeNull();
  });

  it('collects the keys of a subtree', () => {
    const inner = col('inner', 'mon', { linkedSectionId: 'S-inner' });
    expect([...subtreeSectionKeys('mon', [root, mon, inner])].sort()).toEqual([
      'S-inner',
      'S-mon',
    ]);
  });
});
