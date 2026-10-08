import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LibraryFolder } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));

import { useFolderLibraryView } from './useFolderLibraryView';
import {
  resetLastLibraryLocationCache,
  saveLastLibraryLocation,
} from './lastLibraryLocation';

interface Item {
  id: string;
  title: string;
  folderId?: string | null;
  updatedAt: number;
}

const NOW = Date.now();
const folder = (id: string, parentId: string | null): LibraryFolder => ({
  id,
  name: id.toUpperCase(),
  parentId,
  order: 0,
  createdAt: 0,
});
const FOLDERS = [folder('unit', null), folder('week', 'unit')];
const ITEMS: Item[] = [
  { id: 'root-1', title: 'Alpha', folderId: null, updatedAt: NOW },
  { id: 'unit-1', title: 'Beta', folderId: 'unit', updatedAt: NOW - 1 },
  { id: 'week-1', title: 'Beta deep', folderId: 'week', updatedAt: NOW - 2 },
  { id: 'stale', title: 'Gamma', folderId: 'deleted', updatedAt: 0 },
];

const render = (
  enabled: boolean,
  folders: LibraryFolder[] = FOLDERS,
  userId = 'teacher'
) =>
  renderHook(
    ({ f }) =>
      useFolderLibraryView<Item>({
        items: ITEMS,
        searchFields: (i) => i.title,
        sortComparators: { manual: () => 0 },
        folderView: {
          library: 'flashcards',
          userId,
          folders: f,
          foldersLoading: false,
          getId: (i) => i.id,
          itemNoun: ['set', 'sets'],
          enabled,
        },
      }),
    { initialProps: { f: folders } }
  );

const ids = (items: Item[]) => items.map((i) => i.id);

describe('useFolderLibraryView', () => {
  beforeEach(() => resetLastLibraryLocationCache());

  it('keeps the legacy filter when the flag is off', () => {
    const { result } = render(false);
    expect(result.current.folderView).toBeNull();
    expect(ids(result.current.visibleItems)).toHaveLength(4);
    act(() => result.current.onSelectFolder('unit'));
    expect(ids(result.current.visibleItems)).toEqual(['unit-1']);
  });

  it('opens at the top level with folder rows and unfiled items', () => {
    const { result } = render(true);
    const fv = result.current.folderView;
    expect(fv?.location).toEqual({ kind: 'folder', folderId: null });
    expect(fv?.folderRows.map((r) => [r.folder.id, r.label])).toEqual([
      ['unit', '1 folder · 2 sets'],
    ]);
    // An item in a deleted folder counts as unfiled.
    expect(ids(result.current.visibleItems)).toEqual(['root-1', 'stale']);
  });

  it('shows only direct contents inside a folder, and searches its subtree', () => {
    const { result } = render(true);
    act(() => result.current.onSelectFolder('unit'));
    expect(ids(result.current.visibleItems)).toEqual(['unit-1']);
    expect(result.current.folderView?.folderRows).toHaveLength(1);
    expect(result.current.selectedFolderId).toBe('unit');

    act(() => result.current.toolbarProps.onSearchChange('beta'));
    expect(ids(result.current.visibleItems)).toEqual(['unit-1', 'week-1']);
    expect(result.current.folderView?.folderRows).toHaveLength(0);
    expect(result.current.folderView?.pathByItemId.get('week-1')).toBe(
      'UNIT › WEEK'
    );
    expect(result.current.folderView?.pathByItemId.has('unit-1')).toBe(false);

    act(() => result.current.toolbarProps.onSearchChange('alpha'));
    expect(ids(result.current.visibleItems)).toEqual([]);
    act(() => result.current.folderView?.setSearchScope('all'));
    expect(ids(result.current.visibleItems)).toEqual(['root-1']);

    act(() => result.current.toolbarProps.onSearchChange(''));
    expect(result.current.folderView?.searchScope).toBe('folder');
  });

  it('lists everything with paths in All items and locks reorder', () => {
    const { result } = render(true);
    act(() => result.current.folderView?.navigate({ kind: 'all' }));
    expect(ids(result.current.visibleItems)).toHaveLength(4);
    expect(result.current.folderView?.pathByItemId.get('unit-1')).toBe('UNIT');
    expect(result.current.reorderLocked).toBe(true);
    expect(result.current.prepareReorder()).toBe(false);
  });

  it('lists recent items newest first', () => {
    const { result } = render(true);
    act(() => result.current.folderView?.navigate({ kind: 'recent' }));
    expect(ids(result.current.visibleItems)).toEqual([
      'root-1',
      'unit-1',
      'week-1',
    ]);
  });

  it('flags an empty folder', () => {
    const { result } = render(true, [...FOLDERS, folder('empty', null)]);
    act(() => result.current.onSelectFolder('empty'));
    expect(result.current.folderView?.emptyFolder).toBe(true);
  });

  it('returns to the top level when the open folder is deleted', () => {
    const { result, rerender } = render(true);
    act(() => result.current.onSelectFolder('week'));
    rerender({ f: [FOLDERS[0]] });
    expect(result.current.folderView?.location).toEqual({
      kind: 'folder',
      folderId: null,
    });
  });

  it('reopens the last folder for this library', async () => {
    saveLastLibraryLocation('teacher', 'flashcards', 'week');
    const { result } = render(true);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.folderView?.location).toEqual({
      kind: 'folder',
      folderId: 'week',
    });
  });
});
