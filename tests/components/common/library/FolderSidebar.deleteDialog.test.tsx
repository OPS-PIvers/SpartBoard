// Folder-view delete dialog and folder colours (LIBRARY_FOLDERS D11, D17-D20).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import type { FolderDeleteConfig } from '@/components/common/library/FolderSidebar';
import type { LibraryFolder } from '@/types';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const folder = (
  id: string,
  name: string,
  parentId: string | null = null
): LibraryFolder => ({ id, name, parentId, order: 0, createdAt: 0 });

const FOLDERS = [
  folder('unit', 'Unit 3'),
  folder('wk1', 'Week 1', 'unit'),
  folder('wk2', 'Week 2', 'wk1'),
  folder('empty', 'Empty'),
];

const ITEMS = [
  { id: 'a', folderId: 'unit' },
  { id: 'b', folderId: 'wk1' },
  { id: 'c', folderId: 'wk2' },
  { id: 'd', folderId: 'wk2' },
  { id: 'outside', folderId: null },
];

const setup = (overrides: Partial<FolderDeleteConfig> = {}) => {
  const undo = vi.fn().mockResolvedValue(undefined);
  const onDeleteFolder = vi
    .fn()
    .mockImplementation((_id: string, mode: string) =>
      Promise.resolve(mode === 'move-to-parent' ? undo : undefined)
    );
  const deleteItems = vi.fn().mockResolvedValue(undefined);
  const onDeleted = vi.fn();
  const onSetFolderColor = vi.fn().mockResolvedValue(undefined);
  render(
    <FolderSidebar
      widget="quiz"
      folders={FOLDERS}
      selectedFolderId={null}
      onSelectFolder={vi.fn()}
      onDeleteFolder={onDeleteFolder}
      onSetFolderColor={onSetFolderColor}
      folderDelete={{
        noun: { one: 'quiz', many: 'quizzes' },
        items: ITEMS,
        isBlocked: (id) => id === 'c',
        blockedReason: (n) => `${n} quiz has a live assignment`,
        deleteItems,
        onDeleted,
        ...overrides,
      }}
    />
  );
  return { onDeleteFolder, deleteItems, onDeleted, undo, onSetFolderColor };
};

const openDelete = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
};

describe('FolderSidebar folder-view delete dialog', () => {
  it('counts every subfolder and item below the folder', () => {
    setup();
    openDelete('Unit 3');
    expect(screen.getByText('2 folders · 4 quizzes inside')).toBeTruthy();
    expect(
      screen.getByText(/Move the 2 folders and 4 quizzes to/)
    ).toBeTruthy();
    expect(
      screen.getByText('Deletes 3 folders and 3 quizzes. You can’t undo this.')
    ).toBeTruthy();
  });

  it('keeps everything by default and reports an undo', async () => {
    const { onDeleteFolder, deleteItems, onDeleted, undo } = setup();
    openDelete('Unit 3');
    fireEvent.click(screen.getByRole('button', { name: 'Delete folder' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(onDeleteFolder).toHaveBeenCalledWith('unit', 'move-to-parent');
    expect(deleteItems).not.toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalledWith('Deleted “Unit 3”', undo);
  });

  it('deletes everything except blocked items, which the folder delete moves up', async () => {
    const { onDeleteFolder, deleteItems, onDeleted } = setup();
    openDelete('Unit 3');
    fireEvent.click(screen.getByText('Delete the folder and everything in it'));
    expect(
      screen.getByText(/1 quiz has a live assignment, so it’ll be kept/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete 3 quizzes' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(deleteItems).toHaveBeenCalledWith(['a', 'b', 'd']);
    expect(onDeleteFolder).toHaveBeenCalledWith('unit', 'delete-all');
    expect(onDeleted).toHaveBeenCalledWith('Deleted “Unit 3” and 3 quizzes');
  });

  it('keeps the folder and shows the error when the item delete fails', async () => {
    const { onDeleteFolder } = setup({
      deleteItems: vi.fn().mockRejectedValue(new Error('Drive is offline')),
    });
    openDelete('Unit 3');
    fireEvent.click(screen.getByText('Delete the folder and everything in it'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 3 quizzes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Drive is offline'
    );
    expect(onDeleteFolder).not.toHaveBeenCalled();
  });

  it('offers only "Keep everything" without a widget delete path', () => {
    setup({ deleteItems: undefined });
    openDelete('Unit 3');
    expect(
      screen.queryByText('Delete the folder and everything in it')
    ).toBeNull();
  });

  it('deletes an empty folder at once, with an undo', async () => {
    const { onDeleteFolder, onDeleted, undo } = setup();
    openDelete('Empty');
    await waitFor(() =>
      expect(onDeleted).toHaveBeenCalledWith('Deleted “Empty”', undo)
    );
    expect(onDeleteFolder).toHaveBeenCalledWith('empty', 'move-to-parent');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sets and clears a folder colour from the menu', () => {
    const { onSetFolderColor } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Empty' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Teal' }));
    expect(onSetFolderColor).toHaveBeenCalledWith('empty', 'teal');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Empty' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'No color' }));
    expect(onSetFolderColor).toHaveBeenCalledWith('empty', null);
  });
});
