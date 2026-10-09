// Dropping an unfiled shared item on "Library" is a no-op and must not toast "Moved".
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import { LibraryDndContext } from '@/components/common/library/LibraryDndContext';
import type { LibraryFolderViewModel } from '@/components/common/library/LibraryFolderViewContext';
import { DashboardActionsContext } from '@/context/dashboardCanvasStore';

const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as ((e: DragEndEvent) => void) | undefined,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      onDragEnd,
      children,
    }: {
      onDragEnd: (e: DragEndEvent) => void;
      children: React.ReactNode;
    }) => {
      dnd.onDragEnd = onDragEnd;
      return <>{children}</>;
    },
    DragOverlay: () => null,
  };
});

const addToast = vi.fn();
const onDropOnFolder = vi.fn().mockResolvedValue(undefined);

const FOLDER_OF: Record<string, string | null> = {
  'building:a': 'source:building',
  'building:b': 'unit',
  own: 'unit',
};

const folderView = {
  folderIdOf: (id: string) => FOLDER_OF[id] ?? null,
  itemNoun: ['set', 'sets'],
  index: { byId: new Map() },
} as unknown as LibraryFolderViewModel;

const dropOnRoot = async (id: string): Promise<void> => {
  await act(async () => {
    dnd.onDragEnd?.({
      active: { id },
      over: {
        id: 'root',
        data: { current: { type: 'folder', folderId: null } },
      },
    } as unknown as DragEndEvent);
    await Promise.resolve();
  });
};

describe('LibraryDndContext drop on Library root', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    render(
      <DashboardActionsContext.Provider
        value={
          { addToast } as unknown as React.ContextType<
            typeof DashboardActionsContext
          >
        }
      >
        <LibraryDndContext
          itemIds={Object.keys(FOLDER_OF)}
          onDropOnFolder={onDropOnFolder}
          folderView={folderView}
        >
          <div />
        </LibraryDndContext>
      </DashboardActionsContext.Provider>
    );
  });

  it('does nothing for an unfiled shared item', async () => {
    await dropOnRoot('building:a');
    expect(onDropOnFolder).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('still moves a filed shared item and an own item', async () => {
    await dropOnRoot('building:b');
    await dropOnRoot('own');
    expect(onDropOnFolder).toHaveBeenCalledWith('building:b', null);
    expect(onDropOnFolder).toHaveBeenCalledWith('own', null);
    expect(addToast).toHaveBeenCalledTimes(2);
  });
});
