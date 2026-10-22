import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import type { LibraryFolder } from '@/types';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const folder = (id: string, order: number): LibraryFolder => ({
  id,
  name: id,
  parentId: null,
  order,
  createdAt: 0,
});

// Stored order differs from creation order to prove the menu follows `order`.
const FOLDERS = [folder('Unit 3', 0), folder('Unit 1', 1), folder('Unit 2', 2)];

const openMenu = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));

describe('FolderSidebar folder reordering', () => {
  it('hides Move up and Move down without a reorder handler', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={FOLDERS}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
      />
    );
    openMenu('Unit 1');
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Move down' })).toBeNull();
  });

  it('moves a folder up or down among its siblings', () => {
    const onReorderSiblings = vi.fn().mockResolvedValue(undefined);
    render(
      <FolderSidebar
        widget="quiz"
        folders={FOLDERS}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        onReorderSiblings={onReorderSiblings}
      />
    );
    openMenu('Unit 1');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(onReorderSiblings).toHaveBeenLastCalledWith(null, [
      'Unit 1',
      'Unit 3',
      'Unit 2',
    ]);

    openMenu('Unit 1');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(onReorderSiblings).toHaveBeenLastCalledWith(null, [
      'Unit 3',
      'Unit 2',
      'Unit 1',
    ]);
  });

  it('offers no Move up on the first folder or Move down on the last', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={FOLDERS}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        onReorderSiblings={vi.fn().mockResolvedValue(undefined)}
      />
    );
    openMenu('Unit 3');
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeTruthy();
    openMenu('Unit 2');
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Move down' })).toBeNull();
  });
});
