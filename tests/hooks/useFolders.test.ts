/**
 * Shape test for the Wave 3-A `useFolders` shell.
 *
 * Wave 3-A ships the hook as a no-op shell with the full return-type
 * contract Wave 3-B will implement. These tests pin the public shape so
 * that later commits can't silently drop a field or change a signature
 * without the tests catching it.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFolders, folderCollectionName } from '../../hooks/useFolders';
import type { LibraryFolderWidget } from '../../types';

describe('useFolders (Wave 3-A shell)', () => {
  const widgets: LibraryFolderWidget[] = [
    'quiz',
    'video_activity',
    'guided_learning',
    'miniapp',
  ];

  it.each(widgets)('returns the expected empty shape for %s', (widget) => {
    const { result } = renderHook(() => useFolders('user-1', widget));

    expect(result.current.folders).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    expect(typeof result.current.createFolder).toBe('function');
    expect(typeof result.current.renameFolder).toBe('function');
    expect(typeof result.current.moveFolder).toBe('function');
    expect(typeof result.current.deleteFolder).toBe('function');
    expect(typeof result.current.reorderSiblings).toBe('function');
  });

  it('returns the same shape when userId is undefined', () => {
    const { result } = renderHook(() => useFolders(undefined, 'quiz'));

    expect(result.current.folders).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('write operations reject until Wave 3-B implements them', async () => {
    const { result } = renderHook(() => useFolders('user-1', 'quiz'));

    await expect(result.current.createFolder('New', null)).rejects.toThrow(
      /Wave 3-B/
    );
    await expect(result.current.renameFolder('f1', 'X')).rejects.toThrow(
      /Wave 3-B/
    );
    await expect(result.current.moveFolder('f1', null)).rejects.toThrow(
      /Wave 3-B/
    );
    await expect(result.current.deleteFolder('f1')).rejects.toThrow(/Wave 3-B/);
    await expect(result.current.reorderSiblings(null, [])).rejects.toThrow(
      /Wave 3-B/
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
