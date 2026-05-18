import { describe, it, expect } from 'vitest';
import { pickInitialBoard } from '@/utils/pickInitialBoard';
import type { Collection, Dashboard } from '@/types';

const board = (over: Partial<Dashboard> = {}): Dashboard => ({
  id: over.id ?? 'b-default',
  name: over.name ?? 'Default Board',
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  order: over.order ?? 0,
  collectionId: over.collectionId ?? null,
  isPinned: over.isPinned ?? false,
  isDefault: over.isDefault ?? false,
  ...over,
});

const collection = (over: Partial<Collection> = {}): Collection => ({
  id: over.id ?? 'c1',
  name: over.name ?? 'Collection 1',
  parentCollectionId: over.parentCollectionId ?? null,
  order: over.order ?? 0,
  createdAt: 0,
  ...over,
});

describe('pickInitialBoard', () => {
  it('returns null when no boards exist', () => {
    expect(pickInitialBoard([], null, undefined, [])).toBeNull();
  });

  it('returns the remembered Board when it still exists in the right Collection', () => {
    const target = board({ id: 'b1', collectionId: 'c1' });
    const other = board({ id: 'b2', collectionId: 'c1' });
    const result = pickInitialBoard([target, other], 'c1', { c1: 'b1' }, [
      collection({ id: 'c1' }),
    ]);
    expect(result?.id).toBe('b1');
  });

  it('skips the remembered Board when it has moved out of the Collection', () => {
    const moved = board({ id: 'b1', collectionId: 'c2' });
    const sibling = board({ id: 'b2', collectionId: 'c1', order: 0 });
    const result = pickInitialBoard([moved, sibling], 'c1', { c1: 'b1' }, [
      collection({ id: 'c1' }),
    ]);
    expect(result?.id).toBe('b2');
  });

  it('falls back to the Collection defaultBoardId when no memory exists', () => {
    const b = board({ id: 'defaultInColl', collectionId: 'c1' });
    const other = board({ id: 'otherInColl', collectionId: 'c1', order: 0 });
    const result = pickInitialBoard([other, b], 'c1', undefined, [
      collection({ id: 'c1', defaultBoardId: 'defaultInColl' }),
    ]);
    expect(result?.id).toBe('defaultInColl');
  });

  it('falls back to the first Board in the Collection by order', () => {
    const b2 = board({ id: 'second', collectionId: 'c1', order: 5 });
    const b1 = board({ id: 'first', collectionId: 'c1', order: 1 });
    const result = pickInitialBoard([b2, b1], 'c1', undefined, [
      collection({ id: 'c1' }),
    ]);
    expect(result?.id).toBe('first');
  });

  it('falls back to the global isDefault when the Collection is empty', () => {
    const orphan = board({ id: 'g1', collectionId: null, isDefault: true });
    const inOther = board({ id: 'g2', collectionId: 'cOther' });
    const result = pickInitialBoard([orphan, inOther], 'c1', undefined, [
      collection({ id: 'c1' }),
    ]);
    expect(result?.id).toBe('g1');
  });

  it('treats null lastActiveCollectionId as the root Collection', () => {
    const rootBoard = board({ id: 'r1', collectionId: null, order: 0 });
    const inColl = board({ id: 'i1', collectionId: 'c1' });
    const result = pickInitialBoard(
      [inColl, rootBoard],
      null,
      // Literal '_root_' (not the ROOT_COLLECTION_KEY constant) is
      // deliberate: this verifies the runtime lookup-key contract a caller
      // sees, not which constant the helper happens to import.
      { _root_: 'r1' },
      []
    );
    expect(result?.id).toBe('r1');
  });

  it('falls through to global default when lastActiveCollectionId is undefined (profile not yet loaded)', () => {
    const def = board({ id: 'def', isDefault: true });
    const other = board({ id: 'other' });
    const result = pickInitialBoard([other, def], undefined, undefined, []);
    expect(result?.id).toBe('def');
  });
});
