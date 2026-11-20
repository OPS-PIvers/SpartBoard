import { describe, it, expect } from 'vitest';
import type { LibraryFolder } from '@/types';
import { collectDescendantIds } from '@/utils/folderTree';
import {
  buildFolderIndex,
  descendantFolderIds,
  folderPath,
  subtreeFolderIds,
} from './folderView';

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

describe('hoisting only cycle members', () => {
  it('keeps a low-order child under its cycle member', () => {
    const index = buildFolderIndex([
      folder('a', 'b', 1),
      folder('b', 'a', 2),
      folder('c', 'b', 0),
    ]);
    const top = index.childrenOf.get(null)?.map((f) => f.id);
    expect(top).toHaveLength(1);
    expect(top).not.toContain('c');
    expect(folderPath('c', index).map((f) => f.id)).toContain('b');
  });
});

describe('descendantFolderIds follows the displayed tree', () => {
  const f = [folder('a', 'b', 0), folder('b', 'a', 1), folder('child', 'b', 2)];

  it('does not count the displayed parent of a hoisted cycle member', () => {
    expect(descendantFolderIds('b', f).sort()).toEqual(['child']);
    expect(descendantFolderIds('a', f).sort()).toEqual(['b', 'child']);
  });

  it('matches the plain subtree when there is no cycle', () => {
    const tree = [folder('p', null), folder('q', 'p'), folder('r', 'q')];
    expect(descendantFolderIds('p', tree).sort()).toEqual(['q', 'r']);
  });
});
