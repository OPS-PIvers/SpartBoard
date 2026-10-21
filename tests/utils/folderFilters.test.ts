import { describe, it, expect } from 'vitest';
import {
  ROOT_FOLDER_COUNT_KEY,
  countItemsByFolder,
} from '@/components/common/library/folderFilters';

interface FolderedItem {
  id: string;
  folderId?: string | null;
}

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
