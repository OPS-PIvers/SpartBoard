import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FolderPickerPopover } from '@/components/common/library/FolderPickerPopover';
import type { LibraryFolder } from '@/types';

afterEach(cleanup);

describe('FolderPickerPopover — orphaned subtree', () => {
  it('keeps every descendant of an orphaned folder pickable', () => {
    const folders: LibraryFolder[] = [
      {
        id: 'a',
        name: 'Orphan Parent',
        parentId: 'deleted-parent',
        order: 0,
        createdAt: 0,
      },
      { id: 'b', name: 'Orphan Child', parentId: 'a', order: 0, createdAt: 0 },
      {
        id: 'c',
        name: 'Orphan Grandchild',
        parentId: 'b',
        order: 0,
        createdAt: 0,
      },
    ];

    render(
      <FolderPickerPopover
        folders={folders}
        selectedFolderId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        variant="dialog"
      />
    );

    expect(screen.getByText('Orphan Parent')).toBeInTheDocument();
    expect(screen.getByText('Orphan Child')).toBeInTheDocument();
    expect(screen.getByText('Orphan Grandchild')).toBeInTheDocument();
  });
});
