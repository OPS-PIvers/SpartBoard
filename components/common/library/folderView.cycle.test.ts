import { describe, it, expect } from 'vitest';
import type { LibraryFolder } from '@/types';
import { collectDescendantIds } from '@/utils/folderTree';
import { buildFolderIndex, folderPath, subtreeFolderIds } from './folderView';

const folder = (
  id: string,
  parentId: string | null,
  order = 0
): LibraryFolder => ({ id, name: id, parentId, order, createdAt: 0 });

describe('buildFolderIndex parent cycles', () => {
  it('hoists one member of a cross-device move cycle to the top level', () => {
    const index = buildFolderIndex([
      folder('keep', null),
      folder('a', 'b', 0),
      folder('b', 'a', 1),
      folder('child', 'b', 2),
    ]);
    expect(index.childrenOf.get(null)?.map((f) => f.id)).toEqual(['keep', 'a']);
    expect(subtreeFolderIds('a', index)).toEqual(new Set(['a', 'b', 'child']));
    expect(folderPath('a', index).map((f) => f.id)).toEqual(['a']);
    expect(folderPath('child', index).map((f) => f.id)).toEqual([
      'a',
      'b',
      'child',
    ]);
  });

  it('keeps a self-parented folder reachable', () => {
    const index = buildFolderIndex([folder('s', 's')]);
    expect(index.childrenOf.get(null)?.map((f) => f.id)).toEqual(['s']);
  });
});

describe('collectDescendantIds on parent cycles', () => {
  it('terminates with correct counts on an A<->B cycle and a self-parent', () => {
    const f = [folder('a', 'b'), folder('b', 'a'), folder('c', 'b')];
    expect(collectDescendantIds('a', f, (x) => x.parentId).sort()).toEqual([
      'b',
      'c',
    ]);
    expect(
      collectDescendantIds('s', [folder('s', 's')], (x) => x.parentId)
    ).toEqual([]);
  });
});
