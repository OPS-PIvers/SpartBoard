import { describe, it, expect } from 'vitest';
import {
  ROOT_FOLDER_COUNT_KEY,
  filterByFolder,
  countItemsByFolder,
  filterSourcedEntriesByFolder,
} from '@/components/common/library/folderFilters';

interface FolderedItem {
  id: string;
  folderId?: string | null;
}

interface SourcedEntry {
  id: string;
  source: 'personal' | 'building';
  folderId?: string | null;
}

describe('filterByFolder', () => {
  const items: FolderedItem[] = [
    { id: 'a', folderId: 'f1' },
    { id: 'b', folderId: 'f2' },
    { id: 'c' },
    { id: 'd', folderId: null },
    { id: 'e', folderId: 'f1' },
  ];

  it('returns the input unchanged when no folder is selected', () => {
    const result = filterByFolder(items, null);
    expect(result).toBe(items);
  });

  it('returns only items whose folderId matches the selection', () => {
    const result = filterByFolder(items, 'f1').map((i) => i.id);
    expect(result).toEqual(['a', 'e']);
  });

  it('treats missing and null folderId identically (root bucket)', () => {
    // Selecting a folder excludes both `undefined` and `null` items.
    expect(filterByFolder(items, 'f1').some((i) => i.folderId == null)).toBe(
      false
    );
  });

  it('returns an empty array when no items match the selected folder', () => {
    expect(filterByFolder(items, 'does-not-exist')).toEqual([]);
  });
});

describe('countItemsByFolder', () => {
  it('buckets items by folderId and uses the root key for unfoldered items', () => {
    const items: FolderedItem[] = [
      { id: 'a', folderId: 'f1' },
      { id: 'b', folderId: 'f1' },
      { id: 'c', folderId: 'f2' },
      { id: 'd' },
      { id: 'e', folderId: null },
    ];
    expect(countItemsByFolder(items)).toEqual({
      f1: 2,
      f2: 1,
      [ROOT_FOLDER_COUNT_KEY]: 2,
    });
  });

  it('returns an empty object for an empty input', () => {
    expect(countItemsByFolder([])).toEqual({});
  });

  it('only creates keys for folders that contain items', () => {
    const items: FolderedItem[] = [{ id: 'a', folderId: 'only-one' }];
    const counts = countItemsByFolder(items);
    expect(Object.keys(counts)).toEqual(['only-one']);
  });
});

describe('filterSourcedEntriesByFolder', () => {
  const entries: SourcedEntry[] = [
    { id: 'p1', source: 'personal', folderId: 'f1' },
    { id: 'p2', source: 'personal', folderId: 'f2' },
    { id: 'p3', source: 'personal' },
    { id: 'b1', source: 'building' },
    { id: 'b2', source: 'building', folderId: null },
  ];

  it('returns the input unchanged when no folder is selected', () => {
    expect(filterSourcedEntriesByFolder(entries, null)).toBe(entries);
  });

  it('keeps every building entry regardless of folder selection', () => {
    // Regression: folder filtering previously hid building entries and caused
    // the toolbar Source=Building filter to show an empty library.
    const result = filterSourcedEntriesByFolder(entries, 'f1').map((e) => e.id);
    expect(result).toEqual(['p1', 'b1', 'b2']);
  });

  it('narrows only the personal subset to the selected folder', () => {
    const result = filterSourcedEntriesByFolder(entries, 'f2').map((e) => e.id);
    expect(result).toEqual(['p2', 'b1', 'b2']);
  });

  it('drops personal entries whose folder does not match, but keeps building', () => {
    const result = filterSourcedEntriesByFolder(entries, 'unknown-folder');
    expect(result.every((e) => e.source === 'building')).toBe(true);
    expect(result.map((e) => e.id)).toEqual(['b1', 'b2']);
  });
});
