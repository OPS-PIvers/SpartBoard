import { describe, expect, it } from 'vitest';
import {
  orderSectionsParentsFirst,
  parseLinkedCollectionPath,
  safeName,
  safeStyleValue,
  sharedBoardBelongsToLink,
  uniqueLinkedBoards,
} from './linkedCollectionImport';

const link = { linkId: 'link-1', mode: 'synced' as const };

describe('parseLinkedCollectionPath', () => {
  it('reads the link id', () => {
    expect(parseLinkedCollectionPath('/share/collection/abc')).toBe('abc');
    expect(parseLinkedCollectionPath('/share/collection/abc/')).toBe('abc');
  });
  it('ignores other share routes and empty ids', () => {
    expect(parseLinkedCollectionPath('/share/abc')).toBeNull();
    expect(parseLinkedCollectionPath('/share-collection/abc')).toBeNull();
    expect(parseLinkedCollectionPath('/share/collection/')).toBeNull();
    expect(parseLinkedCollectionPath('/share/collection/%E0%A4%A')).toBeNull();
  });
});

describe('sharedBoardBelongsToLink', () => {
  it('accepts a share stamped with this link and mode', () => {
    expect(
      sharedBoardBelongsToLink(
        { linkedCollectionId: 'link-1', intendedMode: 'synced' },
        link
      )
    ).toBe(true);
  });
  it('refuses an unrelated share listed by a collaborator', () => {
    expect(sharedBoardBelongsToLink({ intendedMode: 'synced' }, link)).toBe(
      false
    );
    expect(
      sharedBoardBelongsToLink(
        { linkedCollectionId: 'other', intendedMode: 'synced' },
        link
      )
    ).toBe(false);
  });
  it('refuses a share whose mode differs from the link', () => {
    expect(
      sharedBoardBelongsToLink(
        { linkedCollectionId: 'link-1', intendedMode: 'copy' },
        link
      )
    ).toBe(false);
    expect(
      sharedBoardBelongsToLink(
        { linkedCollectionId: 'link-1', intendedMode: 'synced' },
        { linkId: 'link-1', mode: 'view-only' }
      )
    ).toBe(false);
  });
});

describe('uniqueLinkedBoards', () => {
  it('sorts by order and drops duplicate or empty share ids', () => {
    const result = uniqueLinkedBoards([
      { shareId: 'b', name: 'B', order: 2 },
      { shareId: 'a', name: 'A', order: 1 },
      { shareId: 'a', name: 'A again', order: 3 },
      { shareId: '', name: 'Empty', order: 0 },
    ]);
    expect(result.map((b) => b.name)).toEqual(['A', 'B']);
  });
});

describe('orderSectionsParentsFirst', () => {
  it('puts parents before children', () => {
    const result = orderSectionsParentsFirst([
      { id: 'child', name: 'Child', parentId: 'parent', order: 0 },
      { id: 'parent', name: 'Parent', parentId: null, order: 1 },
      { id: 'top', name: 'Top', parentId: null, order: 0 },
    ]);
    expect(result.map((s) => s.id)).toEqual(['top', 'parent', 'child']);
  });
  it('re-roots orphans and cycles without dropping them', () => {
    const result = orderSectionsParentsFirst([
      { id: 'a', name: 'A', parentId: 'b', order: 0 },
      { id: 'b', name: 'B', parentId: 'a', order: 1 },
      { id: 'orphan', name: 'O', parentId: 'missing', order: 2 },
    ]);
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'orphan']);
    expect(result.find((s) => s.id === 'a')?.parentId).toBeNull();
    expect(result.find((s) => s.id === 'b')?.parentId).toBe('a');
    expect(result.find((s) => s.id === 'orphan')?.parentId).toBeNull();
  });
  it('drops duplicate section ids', () => {
    const result = orderSectionsParentsFirst([
      { id: 'x', name: 'X', parentId: null, order: 0 },
      { id: 'x', name: 'X2', parentId: null, order: 1 },
    ]);
    expect(result).toHaveLength(1);
  });
});

describe('collaborator-written fields', () => {
  it('narrows malformed board entries', () => {
    const result = uniqueLinkedBoards([
      { shareId: 'a', name: { evil: true }, order: 'x', sectionId: 7 },
      { shareId: 5, name: 'No id', order: 0 },
      null,
    ]);
    expect(result).toEqual([{ shareId: 'a', name: '', order: 0 }]);
    expect(uniqueLinkedBoards('not a list')).toEqual([]);
  });
  it('narrows malformed sections and blank names', () => {
    const result = orderSectionsParentsFirst([
      { id: 's', name: '   ', parentId: 3, order: NaN, color: { x: 1 } },
    ]);
    expect(result).toEqual([{ id: 's', name: '', parentId: null, order: 0 }]);
  });
  it('falls back for blank or non-string names and style values', () => {
    expect(safeName('  ', 'Fallback')).toBe('Fallback');
    expect(safeName(42, 'Fallback')).toBe('Fallback');
    expect(safeName(' Unit 3 ', 'Fallback')).toBe('Unit 3');
    expect(safeStyleValue('#ad2122')).toBe('#ad2122');
    expect(safeStyleValue({})).toBeUndefined();
  });
});
