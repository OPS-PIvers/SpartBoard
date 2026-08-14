/**
 * Regression test for a missing-Escape-handler bug in FolderItem's dock
 * folder popover.
 *
 * BUG: The popover (opened by clicking a dock folder to reveal its
 * contents) only dismissed via useClickOutside — there was no Escape
 * handler, unlike every other click-to-dismiss popover in this codebase
 * (e.g. ToolDockItem's restore-minimized popover, SidebarPlcs's PlcRow).
 *
 * That absence isn't just a missing convenience: the dock lives OUTSIDE
 * any `.widget` DraggableWindow, so an unhandled Escape here bubbles all
 * the way up to DashboardView's global `window`-level Escape handler.
 * That handler finds no typing field and no `.widget` ancestor for the
 * dock button, so it falls back to targeting the topmost z-index widget
 * on the board and dispatches a 'widget-keyboard-action' Escape event —
 * which DraggableWindow's handler interprets as "minimize this widget".
 * Net effect: a teacher opens a dock folder popover, presses Escape to
 * dismiss it, and an unrelated widget on their live board (e.g. a running
 * timer) silently minimizes instead.
 *
 * FIX: FolderItem now closes the popover on Escape AND calls
 * `stopPropagation()`, so the keydown never reaches the window-level
 * listener that DashboardView installs.
 *
 * This test simulates that window-level listener directly (rather than
 * mounting the full DashboardView, which pulls in nearly the entire app)
 * to prove both halves of the fix: the popover closes, and the event does
 * not leak past the popover's own handler.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { DockFolder } from '@/types';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

// FolderItem's closed-folder button renders <DockLabel>, which reads global
// style off the dashboard-canvas store context (`useGlobalStyle`) rather than
// the `globalStyle` prop threaded through the rest of the tree.
vi.mock('@/context/dashboardCanvasStore', () => ({
  useGlobalStyle: () => DEFAULT_GLOBAL_STYLE,
}));

import { FolderItem } from '@/components/layout/dock/FolderItem';

afterEach(cleanup);

const folder: DockFolder = {
  id: 'folder-1',
  name: 'My Folder',
  items: ['clock', 'time-tool'],
};

function renderPopover(): void {
  const noop = vi.fn();
  render(
    <DndContext>
      <SortableContext items={[folder.id]}>
        <FolderItem
          folder={folder}
          onAdd={noop}
          onRename={noop}
          onDelete={noop}
          isEditMode={false}
          onLongPress={noop}
          minimizedWidgetsByType={{} as never}
          onRemoveItem={noop}
          onReorder={noop}
          globalStyle={DEFAULT_GLOBAL_STYLE}
          canAccessTool={() => true}
        />
      </SortableContext>
    </DndContext>
  );
  fireEvent.click(screen.getByText('My Folder'));
}

describe('FolderItem — folder popover Escape dismissal', () => {
  it('closes the popover when Escape is pressed', () => {
    renderPopover();
    expect(screen.getByText('Clock')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', bubbles: true });

    expect(screen.queryByText('Clock')).not.toBeInTheDocument();
  });

  it('does not leak the Escape keydown to window-level listeners (would otherwise let DashboardView minimize an unrelated widget)', () => {
    renderPopover();
    expect(screen.getByText('Clock')).toBeInTheDocument();

    // Stand-in for DashboardView's `window.addEventListener('keydown', ...)`
    // global handler, which (with nothing else to guide it) would dispatch
    // a 'widget-keyboard-action' Escape event at the topmost widget.
    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
