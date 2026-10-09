import { describe, it, expect } from 'vitest';
import type { LibraryFolder } from '@/types';
import {
  RECENT_LIMIT,
  RECENT_WINDOW_MS,
  breadcrumbEntries,
  buildFolderIndex,
  folderPath,
  folderTotals,
  formatFolderTotals,
  latestAssignedAt,
  parseLocationKey,
  locationKey,
  pickRecent,
  sortFolders,
  subtreeFolderIds,
} from './folderView';
import { sourceFolder } from './sourceFolders';

const folder = (
  id: string,
  parentId: string | null,
  extra: Partial<LibraryFolder> = {}
): LibraryFolder => ({
  id,
  name: id,
  parentId,
  order: 0,
  createdAt: 0,
  ...extra,
});

const FOLDERS = [
  folder('a', null),
  folder('a1', 'a'),
  folder('a1x', 'a1'),
  folder('b', null),
  folder('orphan', 'gone'),
];
const index = buildFolderIndex(FOLDERS);

describe('folderView helpers', () => {
  it('treats a folder whose parent is gone as top level', () => {
    expect(index.childrenOf.get(null)?.map((f) => f.id)).toEqual([
      'a',
      'b',
      'orphan',
    ]);
  });

  it('builds the path from the top level down', () => {
    expect(folderPath('a1x', index).map((f) => f.id)).toEqual([
      'a',
      'a1',
      'a1x',
    ]);
    expect(folderPath(null, index)).toEqual([]);
  });

  it('collects a folder and everything beneath it', () => {
    expect([...subtreeFolderIds('a', index)].sort()).toEqual([
      'a',
      'a1',
      'a1x',
    ]);
    expect(subtreeFolderIds(null, index).size).toBe(FOLDERS.length + 1);
  });

  it('totals subfolders and items recursively', () => {
    const totals = folderTotals(index, ['a', 'a1x', 'a1x', null, 'b']);
    expect(totals.get('a')).toEqual({ folders: 2, items: 3 });
    expect(totals.get('a1')).toEqual({ folders: 1, items: 2 });
    expect(totals.get('b')).toEqual({ folders: 0, items: 1 });
  });

  it('formats totals with the library noun', () => {
    const noun = ['set', 'sets'] as const;
    expect(formatFolderTotals({ folders: 0, items: 1 }, noun)).toBe('1 set');
    expect(formatFolderTotals({ folders: 2, items: 12 }, noun)).toBe(
      '2 folders · 12 sets'
    );
    expect(formatFolderTotals({ folders: 1, items: 0 }, noun)).toBe(
      '1 folder · 0 sets'
    );
    expect(formatFolderTotals({ folders: 0, items: 0 }, noun)).toBe('Empty');
  });

  it('sorts folders by the active item sort', () => {
    const list = [
      folder('Unit 10', null, { order: 0, createdAt: 3 }),
      folder('Unit 2', null, { order: 2, createdAt: 1, updatedAt: 9 }),
      folder('unit 3', null, { order: 1, createdAt: 2 }),
    ];
    const ids = (key: string, dir: 'asc' | 'desc') =>
      sortFolders(list, { key, dir }).map((f) => f.id);
    expect(ids('title', 'asc')).toEqual(['Unit 2', 'unit 3', 'Unit 10']);
    expect(ids('updated', 'desc')).toEqual(['Unit 2', 'Unit 10', 'unit 3']);
    expect(ids('manual', 'asc')).toEqual(['Unit 10', 'unit 3', 'Unit 2']);
    expect(ids('questions', 'desc')).toEqual(['Unit 10', 'unit 3', 'Unit 2']);
  });

  it('keeps source folders pinned on top under every sort', () => {
    const list = [
      folder('Alpha', null, { order: 0, createdAt: 9 }),
      sourceFolder('global'),
      sourceFolder('building'),
    ];
    for (const [key, dir] of [
      ['title', 'asc'],
      ['title', 'desc'],
      ['updated', 'desc'],
      ['manual', 'asc'],
    ] as const) {
      expect(sortFolders(list, { key, dir }).map((f) => f.id)).toEqual([
        'source:building',
        'source:global',
        'Alpha',
      ]);
    }
  });

  it('collapses the middle of a deep breadcrumb', () => {
    const deep = [folder('1', null), folder('2', '1'), folder('3', '2')];
    expect(breadcrumbEntries(deep).map((e) => e.kind)).toEqual([
      'root',
      'folder',
      'folder',
      'folder',
    ]);
    const deeper = [...deep, folder('4', '3')];
    const entries = breadcrumbEntries(deeper);
    expect(entries.map((e) => e.kind)).toEqual([
      'root',
      'gap',
      'folder',
      'folder',
    ]);
    const gap = entries[1];
    expect(gap.kind === 'gap' && gap.hidden.map((f) => f.id)).toEqual([
      '1',
      '2',
    ]);
  });

  it('picks recent items newest first within 30 days, capped', () => {
    const now = 1_000_000_000_000;
    const items = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => ({
      id: i,
      at: now - i * 1000,
    }));
    items.push({ id: 999, at: now - RECENT_WINDOW_MS - 1 });
    const picked = pickRecent(items, (i) => i.at, now);
    expect(picked).toHaveLength(RECENT_LIMIT);
    expect(picked[0].id).toBe(0);
    expect(picked.some((i) => i.id === 999)).toBe(false);
  });

  it('keeps the latest assign time per item', () => {
    const latest = latestAssignedAt(
      [
        { itemId: 'x', createdAt: 5 },
        { itemId: 'x', createdAt: 9 },
        { itemId: 'y', createdAt: 1 },
      ],
      (a) => a.itemId
    );
    expect(latest.get('x')).toBe(9);
    expect(latest.get('y')).toBe(1);
  });

  it('round-trips locations through the saved key', () => {
    for (const loc of [
      { kind: 'folder', folderId: null },
      { kind: 'folder', folderId: 'abc' },
      { kind: 'all' },
      { kind: 'recent' },
    ] as const) {
      expect(parseLocationKey(locationKey(loc))).toEqual(loc);
    }
  });
});
