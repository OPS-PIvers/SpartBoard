/**
 * Shape tests for `useCollections`. Pins the public API so future changes
 * can't silently drop a field or rename a method. Real Firestore behavior
 * (create → rename → move → delete) is covered by integration tests.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCollections } from '@/hooks/useCollections';

describe('useCollections', () => {
  it('returns the expected shape when userId is undefined', () => {
    const { result } = renderHook(() => useCollections(undefined));

    expect(result.current.collections).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    expect(typeof result.current.createCollection).toBe('function');
    expect(typeof result.current.renameCollection).toBe('function');
    expect(typeof result.current.moveCollection).toBe('function');
    expect(typeof result.current.deleteCollection).toBe('function');
    expect(typeof result.current.reorderSiblings).toBe('function');
    expect(typeof result.current.setCollectionMetadata).toBe('function');
    expect(typeof result.current.setCollectionDefaultBoard).toBe('function');
  });

  it('write operations reject when not authenticated', async () => {
    const { result } = renderHook(() => useCollections(undefined));

    await expect(result.current.createCollection('New', null)).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.renameCollection('c1', 'X')).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.moveCollection('c1', null)).rejects.toThrow(
      /Not authenticated/
    );
    await expect(
      result.current.deleteCollection('c1', 'move-to-parent')
    ).rejects.toThrow(/Not authenticated/);
    await expect(result.current.reorderSiblings(null, ['c1'])).rejects.toThrow(
      /Not authenticated/
    );
    await expect(
      result.current.setCollectionMetadata('c1', { color: '#fff' })
    ).rejects.toThrow(/Not authenticated/);
    await expect(
      result.current.setCollectionDefaultBoard('c1', 'b1')
    ).rejects.toThrow(/Not authenticated/);
  });
});
