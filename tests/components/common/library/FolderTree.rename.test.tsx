/**
 * Regression test for stale-closure bug in FolderTree's RenameInput:
 *
 * BUG: Pressing Escape during an inline folder rename called onCancel() which
 * unmounted the focused <input>. The unmounting synchronously fired a blur
 * event whose handler (handleBlur) still held the typed text in ref.current.value.
 * handleBlur saw the typed value !== initial and called onCommit(typedValue),
 * persisting the rename that the user explicitly cancelled.
 *
 * FIX: Set isCancellingRef.current = true synchronously before calling
 * onCancel() so handleBlur can short-circuit on the stale-closure blur.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LibraryFolder } from '@/types';
import { FolderTree } from '@/components/common/library/FolderTree';

// Mock @dnd-kit/core to avoid needing a full DndContext in unit tests.
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

const makeFolder = (overrides: Partial<LibraryFolder> = {}): LibraryFolder => ({
  id: 'folder-1',
  name: 'My Folder',
  parentId: null,
  ownerId: 'user-1',
  widget: 'quiz',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

const defaultProps = {
  folders: [makeFolder()],
  parentId: null as string | null,
  depth: 0,
  selectedFolderId: null as string | null,
  onSelectFolder: vi.fn(),
  expanded: {} as Record<string, boolean>,
  onToggleExpanded: vi.fn(),
  openMenuId: null as string | null,
  onOpenMenu: vi.fn(),
  renamingId: 'folder-1', // Start with the folder in rename mode
  onStartRename: vi.fn(),
  onCommitRename: vi.fn(),
  onCancelRename: vi.fn(),
  onRequestDelete: vi.fn(),
  onCreateChild: vi.fn(),
  onMoveToRoot: vi.fn(),
  enableDrop: false,
};

describe('FolderTree — RenameInput stale-closure Escape bug', () => {
  it('does NOT call onCommitRename when Escape cancels an in-progress rename', async () => {
    const onCommitRename = vi.fn();
    const onCancelRename = vi.fn();

    render(
      <FolderTree
        {...defaultProps}
        onCommitRename={onCommitRename}
        onCancelRename={onCancelRename}
      />
    );

    // The RenameInput should be visible because renamingId matches folder-1.
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();

    // User types a new folder name.
    await userEvent.clear(input);
    await userEvent.type(input, 'Edited Name');

    // Simulate the browser's Escape-then-blur sequence inside a single act()
    // so React processes them in order before flushing the state batch.
    // jsdom does not fire blur automatically when a DOM node is removed, so we
    // replicate the synchronous blur-during-unmount by firing both events inside
    // the same act() — matching the DraggableWindow #1965 / RandomGroups pattern.
    //
    // ORIGINAL code: keyDown → onCancel() (mock, nothing happens) | blur →
    // handleBlur → reads ref.current.value='Edited Name' ≠ initial → calls
    // onCommit('Edited Name') → WRONG (test FAILS before fix).
    //
    // FIXED code: keyDown → isCancellingRef.current=true → onCancel() | blur →
    // handleBlur → flag is true → returns early → onCommit NOT called (PASSES).
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
      // blur fires while the input is still mounted (React defers the state
      // flush until act() exits), replicating the browser's focus-manager order.
      fireEvent.blur(input);
    });

    // onCancelRename must have been called to dismiss the rename input.
    expect(onCancelRename).toHaveBeenCalledTimes(1);

    // CRITICAL: onCommitRename must NOT have been called.
    // Before the fix, the blur event fired by unmounting the focused input
    // would call onCommit("Edited Name") via the stale handleBlur closure,
    // persisting the text the user just cancelled.
    expect(onCommitRename).not.toHaveBeenCalled();
  });

  it('DOES call onCommitRename when Enter confirms a rename', async () => {
    const onCommitRename = vi.fn();
    const onCancelRename = vi.fn();

    render(
      <FolderTree
        {...defaultProps}
        onCommitRename={onCommitRename}
        onCancelRename={onCancelRename}
      />
    );

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'New Name');

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onCommitRename).toHaveBeenCalledWith('folder-1', 'New Name');
    expect(onCancelRename).not.toHaveBeenCalled();
  });

  it('DOES call onCommitRename on blur when the name changed (normal focus-loss)', async () => {
    const onCommitRename = vi.fn();
    const onCancelRename = vi.fn();

    render(
      <FolderTree
        {...defaultProps}
        onCommitRename={onCommitRename}
        onCancelRename={onCancelRename}
      />
    );

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Focus Loss Name');

    // Simulate focus loss without Escape (e.g. clicking elsewhere).
    fireEvent.blur(input);

    expect(onCommitRename).toHaveBeenCalledWith('folder-1', 'Focus Loss Name');
    expect(onCancelRename).not.toHaveBeenCalled();
  });
});
