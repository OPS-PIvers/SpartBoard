import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LibraryFolder } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));

import { useFolderLibraryView } from './useFolderLibraryView';

const folder = (id: string, order: number): LibraryFolder => ({
  id,
  name: id,
  parentId: null,
  order,
  createdAt: 0,
  updatedAt: 100 - order,
});
const FOLDERS = [folder('a', 0), folder('b', 1), folder('c', 2)];

const render = (flagOn: boolean) => {
  const reorderSiblings = vi.fn().mockResolvedValue(undefined);
  const auth = {
    canAccessFeature: (id: string) => flagOn && id === 'library-folder-reorder',
  } as unknown as AuthContextType;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
  );
  const hook = renderHook(
    () =>
      useFolderLibraryView<{ id: string; title: string }>({
        items: [],
        searchFields: (i) => i.title,
        initialSort: { key: 'name', dir: 'desc' },
        sortComparators: { name: () => 0 },
        folderView: {
          library: 'quiz',
          userId: 'teacher',
          folders: FOLDERS,
          foldersLoading: false,
          getId: (i) => i.id,
          itemNoun: ['quiz', 'quizzes'],
          reorderSiblings,
        },
      }),
    { wrapper }
  );
  return { ...hook, reorderSiblings };
};

describe('useFolderLibraryView folder row reordering', () => {
  it('keeps the teacher order and drops a dragged folder after another', () => {
    const { result, reorderSiblings } = render(true);
    const rowIds = () =>
      result.current.folderView?.folderRows.map((r) => r.folder.id);
    expect(rowIds()).toEqual(['a', 'b', 'c']);
    act(() => result.current.folderView?.folderReorder?.start('a'));
    act(() =>
      result.current.folderView?.folderReorder?.over({
        folderId: 'c',
        place: 'after',
      })
    );
    act(() => result.current.folderView?.folderReorder?.drop());
    expect(reorderSiblings).toHaveBeenCalledWith(null, ['b', 'c', 'a']);
  });

  it('offers no folder dragging with the flag off', () => {
    const { result } = render(false);
    expect(result.current.folderView?.folderReorder).toBeNull();
  });
});

describe('useFolderLibraryView stale folder drag', () => {
  it('clears the drag when the dragged row unmounts before dragend', () => {
    let folders = FOLDERS;
    const auth = {
      canAccessFeature: (id: string) => id === 'library-folder-reorder',
    } as unknown as AuthContextType;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    );
    const { result, rerender } = renderHook(
      () =>
        useFolderLibraryView<{ id: string; title: string }>({
          items: [],
          searchFields: (i) => i.title,
          initialSort: { key: 'name', dir: 'desc' },
          sortComparators: { name: () => 0 },
          folderView: {
            library: 'quiz',
            userId: 'teacher',
            folders,
            foldersLoading: false,
            getId: (i) => i.id,
            itemNoun: ['quiz', 'quizzes'],
            reorderSiblings: vi.fn().mockResolvedValue(undefined),
          },
        }),
      { wrapper }
    );
    act(() => result.current.folderView?.folderReorder?.start('a'));
    expect(result.current.folderView?.folderReorder?.draggingId).toBe('a');
    folders = FOLDERS.filter((f) => f.id !== 'a');
    rerender();
    expect(result.current.folderView?.folderReorder?.draggingId).toBeNull();
    folders = FOLDERS;
    rerender();
    expect(result.current.folderView?.folderReorder?.draggingId).toBeNull();
  });
});
