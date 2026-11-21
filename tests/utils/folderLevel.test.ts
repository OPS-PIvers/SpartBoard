import { describe, it, expect } from 'vitest';
import { itemsAtFolderLevel, liveFolderOf } from '@/utils/folderLevel';

type Row = { id: string; folderId?: string | null };
const rows: Row[] = [
  { id: 'a' },
  { id: 'b', folderId: 'f1' },
  { id: 'c', folderId: 'gone' },
  { id: 'd', folderId: 'f2' },
];
const folderOf = liveFolderOf<Row>(
  (r) => r.folderId,
  (id) => id === 'f1' || id === 'f2'
);

describe('itemsAtFolderLevel', () => {
  it('lists only unfiled items, and items whose folder is gone, at the top level', () => {
    expect(itemsAtFolderLevel(rows, null, folderOf).map((r) => r.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('lists only the items filed directly in an open folder', () => {
    expect(itemsAtFolderLevel(rows, 'f1', folderOf).map((r) => r.id)).toEqual([
      'b',
    ]);
  });
});
