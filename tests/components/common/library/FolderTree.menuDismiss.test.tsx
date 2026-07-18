/**
 * Regression test: a folder row's kebab overflow menu (Rename / New
 * subfolder / Move to root / Delete) must dismiss when the user interacts
 * outside it — clicking another folder row, the item grid, or anywhere else
 * in the widget, or pressing Escape.
 *
 * BUG: `FolderRow` (components/common/library/FolderTree.tsx) toggled
 * `openMenuId` only from the kebab button itself and from the menu's own
 * item buttons. There was no outside-click or Escape listener, unlike every
 * other kebab/overflow menu in this codebase (e.g. SidebarPlcs's PlcRow uses
 * `useClickOutside` + an Escape `keydown` listener). `FolderSidebar` is
 * wired into the Quiz/Video Activity/Guided Learning/Mini App library
 * managers, so a teacher opening a folder's actions menu and then clicking
 * anywhere else on the widget would find the menu still floating open.
 *
 * FIX: `FolderRow` now attaches `useClickOutside` (ignoring the kebab
 * button itself) plus an Escape `keydown` listener, both of which call
 * `onOpenMenu(null)` — matching the PlcRow pattern.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LibraryFolder } from '@/types';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';

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

describe('FolderTree — overflow menu dismissal', () => {
  it('closes the menu on an outside click', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={[makeFolder('f1', 'Unit 2')]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        itemCounts={{}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Unit 2' }));
    expect(
      screen.getByRole('menuitem', { name: 'Rename' })
    ).toBeInTheDocument();

    // Click somewhere else entirely — e.g. the "All items" row.
    fireEvent.pointerDown(screen.getByRole('button', { name: /all items/i }));

    expect(
      screen.queryByRole('menuitem', { name: 'Rename' })
    ).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', () => {
    render(
      <FolderSidebar
        widget="quiz"
        folders={[makeFolder('f1', 'Unit 2')]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        itemCounts={{}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Unit 2' }));
    expect(
      screen.getByRole('menuitem', { name: 'Rename' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(
      screen.queryByRole('menuitem', { name: 'Rename' })
    ).not.toBeInTheDocument();
  });
});
