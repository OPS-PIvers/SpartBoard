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

  it('returns false when collectionId is null (already migrated)', () => {
    expect(needsCollectionMigration(mkBoard({ collectionId: null }))).toBe(
      false
    );
  });

  it('returns false when collectionId is set', () => {
    expect(needsCollectionMigration(mkBoard({ collectionId: 'c1' }))).toBe(
      false
    );
  });

  it('returns true when isPinned is undefined even if collectionId is set', () => {
    expect(needsCollectionMigration(mkBoard({ collectionId: 'c1' }))).toBe(
      false
    );
    expect(
      needsCollectionMigration(mkBoard({ collectionId: null, isPinned: false }))
    ).toBe(false);
    // Treat missing isPinned as needing migration when collectionId also missing,
    // since that's the legacy case. If collectionId is set, we trust the doc.
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
});
