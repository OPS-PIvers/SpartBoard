/**
 * Regression test: the "All items" row's badge must reflect every item the
 * row actually opens, not just the unfoldered ("root") bucket.
 *
 * BUG: FolderSidebar computed the "All items" badge as
 * `itemCounts['root']` — the count of unfoldered items only. But
 * `selectedFolderId === null` ("All items" selected) bypasses folder
 * filtering entirely (see `filterByFolder`'s documented contract in
 * folderFilters.ts: "show everything the caller passed in"), so clicking
 * "All items" actually opens every item across every folder plus the root
 * bucket. A teacher with 7 unfoldered quizzes and 3 filed into "Unit 2" saw
 * a "7" badge on a row that opened all 10 quizzes.
 *
 * FIX: the badge now sums every bucket in `itemCounts` (root + every real
 * folder), matching what the row actually shows.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';
import type { LibraryFolder } from '@/types';

// Mock @dnd-kit/core to avoid needing a full DndContext in unit tests.
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const makeFolder = (id: string, name: string): LibraryFolder => ({
  id,
  name,
  parentId: null,
  order: 0,
  createdAt: 0,
});

describe('FolderSidebar — "All items" badge count', () => {
  it('sums every folder bucket, not just the unfoldered ("root") bucket', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={[makeFolder('f1', 'Unit 2')]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        // 7 unfoldered items + 3 items filed in "Unit 2" = 10 total.
        // Clicking "All items" shows all 10 (folder filtering is bypassed
        // when selectedFolderId is null), so the badge must read 10.
        itemCounts={{ root: 7, f1: 3 }}
      />
    );

    const allItemsRow = screen.getByRole('button', { name: /all items/i });
    // Exact-match the badge, not a substring check — a naive `toHaveTextContent('10')`
    // would also pass against the pre-fix "7" badge failing to match, but a substring
    // check on '1' or '0' individually could false-pass against unrelated markup, so
    // assert on the isolated badge node's exact text.
    expect(
      within(allItemsRow).getByText('10', { selector: 'span' })
    ).toBeInTheDocument();
  });

  it('hides the badge entirely when there are no items at all', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={[]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        itemCounts={{}}
      />
    );

    const allItemsRow = screen.getByRole('button', { name: /all items/i });
    expect(within(allItemsRow).queryByText('0')).not.toBeInTheDocument();
  });

  it('matches the single-bucket count when every item is unfoldered', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={[]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        itemCounts={{ root: 4 }}
      />
    );

    const allItemsRow = screen.getByRole('button', { name: /all items/i });
    expect(
      within(allItemsRow).getByText('4', { selector: 'span' })
    ).toBeInTheDocument();
  });
});
