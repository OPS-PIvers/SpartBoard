import { describe, it, expect } from 'vitest';
import { buildDirectoryEntries } from './subDirectory';
import type { SharedCollection } from '@/types';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

const collectionShare = (
  over: Partial<SharedCollection> & { shareId: string }
): SharedCollection => ({
  hostUid: 'h',
  hostDisplayName: 'Paul Ivers',
  intendedMode: 'substitute',
  collection: { name: 'Whiteboard' },
  boardIds: ['board-b730'],
  createdAt: 0,
  expiresAt: 1,
  ...over,
});

describe('buildDirectoryEntries', () => {
  it('lists a single board shared on its own as a board, named from the share', () => {
    const [entry] = buildDirectoryEntries(
      [],
      [
        collectionShare({
          shareId: 's1',
          kind: 'board',
          boards: [
            { id: 'board-b730', name: 'Whiteboard', sectionId: 'x', order: 0 },
          ],
        }),
      ]
    );
    expect(entry).toMatchObject({
      kind: 'collection-board',
      teacherName: 'Paul Ivers',
      boardName: 'Whiteboard',
      shareId: 's1',
      boardId: 'board-b730',
    });
  });

  it('names a collection’s boards in walk order', () => {
    const [entry] = buildDirectoryEntries(
      [],
      [
        collectionShare({
          shareId: 's2',
          kind: 'collection',
          collection: { name: 'Monday' },
          boardIds: ['a', 'b'],
          boards: [
            { id: 'b', name: 'Math', sectionId: 'x', order: 1 },
            { id: 'a', name: 'Morning', sectionId: 'x', order: 0 },
          ],
        }),
      ]
    );
    expect(entry.kind).toBe('collection');
    if (entry.kind !== 'collection') return;
    expect(entry.boards).toEqual([
      { id: 'a', name: 'Morning' },
      { id: 'b', name: 'Math' },
    ]);
  });

  it('leaves pre-v2 collection boards unnamed', () => {
    const [entry] = buildDirectoryEntries(
      [],
      [collectionShare({ shareId: 's3', boardIds: ['a', 'b'] })]
    );
    expect(entry).toMatchObject({
      kind: 'collection',
      boards: [{ id: 'a' }, { id: 'b' }],
    });
  });

  it('groups every share by teacher name', () => {
    const entries = buildDirectoryEntries(
      [
        {
          shareId: 'legacy',
          name: 'Science',
          originalAuthorName: 'Zed Adams',
          widgets: [],
        } as unknown as SubstituteShareDoc,
      ],
      [
        collectionShare({ shareId: 'c1', hostDisplayName: 'Ann Brown' }),
        collectionShare({
          shareId: 'c2',
          hostDisplayName: 'Zed Adams',
          kind: 'board',
        }),
      ]
    );
    expect(entries.map((e) => [e.teacherName, e.kind])).toEqual([
      ['Ann Brown', 'collection'],
      ['Zed Adams', 'board'],
      ['Zed Adams', 'collection-board'],
    ]);
  });

  it('does not crash on a shared board stored without a name', () => {
    const [entry] = buildDirectoryEntries(
      [],
      [
        collectionShare({
          shareId: 's9',
          kind: 'board',
          boards: [
            {
              id: 'board-b730',
              sectionId: 'x',
              order: 0,
            } as unknown as NonNullable<SharedCollection['boards']>[number],
          ],
        }),
      ]
    );
    expect(entry).toMatchObject({ shareId: 's9', boardId: 'board-b730' });
  });
});
