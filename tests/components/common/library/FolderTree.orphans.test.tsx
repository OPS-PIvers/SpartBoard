// Regression: a folder with a deleted parent must still show in the sidebar tree.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import type { LibraryFolder } from '@/types';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const folder = (
  id: string,
  order: number,
  parentId: string | null = null
): LibraryFolder => ({ id, name: id, parentId, order, createdAt: 0 });

const FOLDERS = [folder('Unit 1', 0), folder('Lost', 1, 'deleted-parent')];

describe('FolderSidebar folders with a missing parent', () => {
  it('lists the folder at the top level', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={FOLDERS}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /^Lost/ })).toBeTruthy();
  });

  it('reorders it among the top-level folders', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Lost' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(onReorderSiblings).toHaveBeenCalledWith(null, ['Lost', 'Unit 1']);
  });
});
