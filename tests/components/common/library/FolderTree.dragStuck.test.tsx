import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LibraryFolder } from '@/types';
import { FolderTree } from '@/components/common/library/FolderTree';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const folder = (id: string, order: number): LibraryFolder => ({
  id,
  name: `Folder ${id}`,
  parentId: null,
  order,
  createdAt: 0,
});

const renderTree = (folders: LibraryFolder[]) => (
  <FolderTree
    folders={folders}
    selectedFolderId={null}
    onSelectFolder={vi.fn()}
    expanded={{}}
    onToggleExpanded={vi.fn()}
    openMenuId={null}
    onOpenMenu={vi.fn()}
    renamingId={null}
    onStartRename={vi.fn()}
    onCommitRename={vi.fn()}
    onCancelRename={vi.fn()}
    onRequestDelete={vi.fn()}
    onCreateChild={vi.fn()}
    onMoveToRoot={vi.fn()}
    onReorder={vi.fn()}
  />
);

const dragRow = () => screen.getByText('Folder a').closest('[draggable]');

describe('FolderTree drag state', () => {
  it('clears the dragged row dimming when its drag handlers disappear mid-drag', () => {
    const { rerender } = render(renderTree([folder('a', 0), folder('b', 1)]));
    const row = dragRow();
    if (!row) throw new Error('no draggable row');
    fireEvent.dragStart(row, {
      dataTransfer: { effectAllowed: '', setData: vi.fn() },
    });
    expect(screen.getByText('Folder a').closest('.opacity-50')).not.toBeNull();

    // Sibling deleted remotely: A is no longer reorderable, so dragend has no handler.
    rerender(renderTree([folder('a', 0)]));
    expect(screen.getByText('Folder a').closest('.opacity-50')).toBeNull();
  });
});
