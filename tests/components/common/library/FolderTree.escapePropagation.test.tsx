/**
 * Regression test: FolderRow's overflow-menu Escape handler (FolderTree.tsx)
 * already called onOpenMenu(null) to dismiss the menu, but never called
 * stopPropagation(). FolderSidebar/FolderTree is rendered inside the Quiz /
 * Video Activity / Mini App / Guided Learning library managers, which live
 * inside a `.widget` DraggableWindow. Because the handler didn't stop
 * propagation, the unhandled keydown continued bubbling up to
 * DashboardView's global `window`-level Escape handler, which — finding no
 * typing field focused — dispatches a `widget-keyboard-action` targeting the
 * focused/topmost widget, and DraggableWindow's handler for that event
 * minimizes the widget. Net effect: dismissing a folder's actions menu with
 * Escape could also silently minimize the whole widget on the live board.
 *
 * FIX: the handler now calls event.stopPropagation() before invoking
 * onOpenMenu(null), matching the same fix already applied to ToolDockItem,
 * RemoteControlMenu, ClassRosterMenu, OverflowMenu, ActiveClassChip, and
 * FolderPickerPopover for this exact bug class.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  cleanup,
  screen,
  fireEvent,
  act,
} from '@testing-library/react';
import type { LibraryFolder } from '@/types';
import { FolderSidebar } from '@/components/common/library/FolderSidebar';

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

afterEach(cleanup);

describe('FolderTree — overflow menu Escape does not leak to window-level handlers', () => {
  it('closes the menu on Escape and stops propagation before it reaches window listeners', () => {
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

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
          })
        );
      });

      expect(
        screen.queryByRole('menuitem', { name: 'Rename' })
      ).not.toBeInTheDocument();
      // This is the crux of the regression: DashboardView's global Escape
      // handler is a window-level `keydown` listener. If FolderRow's own
      // handler doesn't stopPropagation, the event still reaches window
      // and DashboardView falls back to minimizing the focused widget.
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
