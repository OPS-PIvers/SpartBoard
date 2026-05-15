import { describe, it, expect } from 'vitest';
import {
  needsCollectionMigration,
  migrateBoardForCollections,
} from '@/utils/collectionsMigration';
import type { Dashboard } from '@/types';

const mkBoard = (overrides: Partial<Dashboard> = {}): Dashboard => ({
  id: 'b1',
  name: 'Test',
  background: 'bg-slate-800',
  widgets: [],
  createdAt: Date.now(),
  ...overrides,
});

describe('needsCollectionMigration', () => {
  it('returns true when collectionId is undefined', () => {
    expect(needsCollectionMigration(mkBoard())).toBe(true);
  });

  it('returns false when collectionId is null and isPinned is set', () => {
    expect(
      needsCollectionMigration(mkBoard({ collectionId: null, isPinned: false }))
    ).toBe(false);
  });

  it('returns false when collectionId is set and isPinned is set', () => {
    expect(
      needsCollectionMigration(mkBoard({ collectionId: 'c1', isPinned: false }))
    ).toBe(false);
  });

  it('returns true when isPinned is undefined even if collectionId is set', () => {
    expect(needsCollectionMigration(mkBoard({ collectionId: 'c1' }))).toBe(
      true
    );
  });

  it('returns false when both collectionId and isPinned are set', () => {
    expect(
      needsCollectionMigration(mkBoard({ collectionId: 'c1', isPinned: false }))
    ).toBe(false);
    expect(
      needsCollectionMigration(mkBoard({ collectionId: null, isPinned: true }))
    ).toBe(false);
  });
});

describe('migrateBoardForCollections', () => {
  it('seeds collectionId: null on legacy boards', () => {
    const result = migrateBoardForCollections(mkBoard());
    expect(result.collectionId).toBeNull();
    expect(result.isPinned).toBe(false);
  });

  it('preserves existing collectionId', () => {
    const result = migrateBoardForCollections(
      mkBoard({ collectionId: 'c1', isPinned: true })
    );
    expect(result.collectionId).toBe('c1');
    expect(result.isPinned).toBe(true);
  });

  it('preserves all other fields', () => {
    const board = mkBoard({ name: 'Original', isDefault: true });
    const result = migrateBoardForCollections(board);
    expect(result.name).toBe('Original');
    expect(result.isDefault).toBe(true);
  });

  it('returns the exact same reference when no migration is needed', () => {
    const board = mkBoard({ collectionId: 'c1', isPinned: false });
    const result = migrateBoardForCollections(board);
    expect(result).toBe(board); // strict reference equality
  });
});
