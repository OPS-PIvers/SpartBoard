/**
 * Shape tests for `useFolders`.
 *
 * Wave 3-B implements the hook against Firestore. These tests pin the
 * public shape so future changes can't silently drop a field or change a
 * signature. Real Firestore behavior (create → rename → move → delete) is
 * covered by integration tests in a follow-up PR.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFolders, folderCollectionName } from '../../hooks/useFolders';
import type { LibraryFolderWidget } from '../../types';

describe('useFolders', () => {
  const widgets: LibraryFolderWidget[] = [
    'quiz',
    'video_activity',
    'guided_learning',
    'miniapp',
  ];

  it.each(widgets)(
    'returns the expected shape when userId is undefined for %s',
    (widget) => {
      const { result } = renderHook(() => useFolders(undefined, widget));

      expect(result.current.folders).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();

      expect(typeof result.current.createFolder).toBe('function');
      expect(typeof result.current.renameFolder).toBe('function');
      expect(typeof result.current.moveFolder).toBe('function');
      expect(typeof result.current.deleteFolder).toBe('function');
      expect(typeof result.current.reorderSiblings).toBe('function');
      expect(typeof result.current.moveItem).toBe('function');
    }
  );

  it('write operations reject when not authenticated', async () => {
    const { result } = renderHook(() => useFolders(undefined, 'quiz'));

    await expect(result.current.createFolder('New', null)).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.renameFolder('f1', 'X')).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.moveFolder('f1', null)).rejects.toThrow(
      /Not authenticated/
    );
    await expect(
      result.current.deleteFolder('f1', 'move-to-parent')
    ).rejects.toThrow(/Not authenticated/);
    await expect(result.current.reorderSiblings(null, ['f1'])).rejects.toThrow(
      /Not authenticated/
    );
    await expect(result.current.moveItem('item-1', null)).rejects.toThrow(
      /Not authenticated/
    );
  });
});

describe('folderCollectionName', () => {
  it('maps each widget to its Firestore collection name', () => {
    expect(folderCollectionName('quiz')).toBe('quiz_folders');
    expect(folderCollectionName('video_activity')).toBe(
      'video_activity_folders'
    );
    expect(folderCollectionName('guided_learning')).toBe(
      'guided_learning_folders'
    );
    expect(folderCollectionName('miniapp')).toBe('miniapp_folders');
  });
});
