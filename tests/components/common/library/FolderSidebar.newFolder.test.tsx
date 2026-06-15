/**
 * Regression test for the stale-closure bug in FolderSidebar's NewFolderInput:
 *
 * BUG: Pressing Escape while typing a new folder name called onCancel() which
 * unmounted the focused <input>. The unmounting synchronously fired a blur
 * event whose handler still held the typed text, so onCommit() ran and created
 * the folder the user explicitly cancelled. (Same class as the FolderTree
 * RenameInput / DraggableWindow #1965 bug.)
 *
 * FIX: Set isCancellingRef.current = true synchronously before calling
 * onCancel() so the onBlur handler short-circuits on the stale-closure blur.
 * An additional `!e.currentTarget?.isConnected` guard covers the separate
 * Enter → unmount → double-commit path.
 *
 * This file closes the coverage gap noted in review: GroupDropZone and
 * FolderTree.RenameInput had regression tests; NewFolderInput did not.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';

// Mock @dnd-kit/core to avoid needing a full DndContext in unit tests.
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const defaultProps = {
  widget: 'quiz' as const,
  folders: [],
  selectedFolderId: null as string | null,
  onSelectFolder: vi.fn(),
};

/** Open the inline new-folder input at the root level and return it. */
function openNewFolderInput(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
  return screen.getByPlaceholderText('New folder name');
}

describe('FolderSidebar — NewFolderInput stale-closure Escape bug', () => {
  it('does NOT call onCreateFolder when Escape cancels new-folder creation', async () => {
    const onCreateFolder = vi.fn().mockResolvedValue('new-id');

    render(<FolderSidebar {...defaultProps} onCreateFolder={onCreateFolder} />);

    const input = openNewFolderInput();
    await userEvent.type(input, 'Unwanted Folder');

    // Replicate the browser's Escape-then-blur sequence inside a single act()
    // so React processes them in order before flushing the state batch. jsdom
    // does not fire blur automatically on DOM removal, so we fire both here —
    // matching the FolderTree.rename / DraggableWindow #1965 pattern.
    //
    // FIXED code: keyDown → isCancellingRef.current = true → onCancel() | blur →
    // handler sees the flag → returns early → onCommit NOT called (PASSES).
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
      fireEvent.blur(input);
    });

    expect(onCreateFolder).not.toHaveBeenCalled();
  });

  it('DOES call onCreateFolder when Enter confirms a new folder', async () => {
    const onCreateFolder = vi.fn().mockResolvedValue('new-id');

    render(<FolderSidebar {...defaultProps} onCreateFolder={onCreateFolder} />);

    const input = openNewFolderInput();
    await userEvent.type(input, 'Keepers');

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // parentId is null for a root-level folder.
    expect(onCreateFolder).toHaveBeenCalledWith('Keepers', null);
  });

  it('DOES call onCreateFolder on blur when a name was typed (normal focus loss)', async () => {
    const onCreateFolder = vi.fn().mockResolvedValue('new-id');

    render(<FolderSidebar {...defaultProps} onCreateFolder={onCreateFolder} />);

    const input = openNewFolderInput();
    await userEvent.type(input, 'Focus Loss Folder');

    // Focus loss without Escape (e.g. clicking elsewhere) commits.
    fireEvent.blur(input);

    expect(onCreateFolder).toHaveBeenCalledWith('Focus Loss Folder', null);
  });
});
