// Regression: FolderTree put aria-expanded on every treeitem <li>, including
// leaf folders with no children to expand — a WAI-ARIA treeview violation
// (aria-expanded must only appear on expandable nodes). Screen readers
// announced leaf folders as "collapsed" even though there is no chevron and
// no way to expand them. Fix: only set aria-expanded when the folder has
// children; leaves omit the attribute entirely.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import type { LibraryFolder } from '@/types';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const makeFolder = (
  id: string,
  name: string,
  parentId: string | null = null
): LibraryFolder => ({ id, name, parentId, order: 0, createdAt: 0 });

afterEach(cleanup);

describe('FolderTree — aria-expanded only on expandable nodes', () => {
  it('omits aria-expanded on a leaf folder but sets it on a folder with children', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={[
          makeFolder('parent', 'Unit 2'),
          makeFolder('child', 'Lesson 1', 'parent'),
        ]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        itemCounts={{}}
      />
    );

    const parentItem = screen
      .getByRole('button', { name: 'Unit 2, 0 items' })
      .closest('[role="treeitem"]');
    const childItem = screen
      .getByRole('button', { name: 'Lesson 1, 0 items' })
      .closest('[role="treeitem"]');

    expect(parentItem).toHaveAttribute('aria-expanded');
    expect(childItem).not.toHaveAttribute('aria-expanded');
  });
});
