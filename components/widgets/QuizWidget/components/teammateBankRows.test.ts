import { describe, expect, it } from 'vitest';
import {
  buildFolderIndex,
  type LibraryLocation,
} from '@/components/common/library/folderView';
import type { LibraryFolder } from '@/types';
import { visibleTeammateBanks } from './teammateBankRows';

const folders = [
  { id: 'unit', name: 'Unit', parentId: null, order: 0, createdAt: 1 },
  { id: 'sub', name: 'Sub', parentId: 'unit', order: 0, createdAt: 1 },
] as LibraryFolder[];
const index = buildFolderIndex(folders);
const banks = [
  { key: 'a', title: 'Cell Biology' },
  { key: 'b', title: 'Genetics' },
];
const folderOf: Record<string, string | null> = { a: 'sub', b: null };
const folderIdOf = (key: string) => folderOf[key] ?? null;

const view = (
  location: LibraryLocation,
  searchActive = false,
  searchScope: 'folder' | 'all' = 'folder'
) => ({ location, index, searchActive, searchScope });

describe('visibleTeammateBanks', () => {
  it('lists every teammate bank in All items', () => {
    expect(
      visibleTeammateBanks(banks, view({ kind: 'all' }), '', folderIdOf)
    ).toEqual(banks);
  });

  it('lists only the open folder in a folder', () => {
    expect(
      visibleTeammateBanks(
        banks,
        view({ kind: 'folder', folderId: 'sub' }),
        '',
        folderIdOf
      ).map((b) => b.key)
    ).toEqual(['a']);
  });

  it('includes title matches when searching, scoped to the folder subtree', () => {
    expect(
      visibleTeammateBanks(
        banks,
        view({ kind: 'all' }, true),
        'genet',
        folderIdOf
      ).map((b) => b.key)
    ).toEqual(['b']);
    expect(
      visibleTeammateBanks(
        banks,
        view({ kind: 'folder', folderId: 'unit' }, true),
        'o',
        folderIdOf
      ).map((b) => b.key)
    ).toEqual(['a']);
  });

  it('shows nothing without the folder view', () => {
    expect(visibleTeammateBanks(banks, null, '', folderIdOf)).toEqual([]);
  });
});
