// Regression: FolderItem's dock popover had no Escape handler, so it leaked to DashboardView's global handler and minimized an unrelated widget.

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

function renderPopover(): HTMLButtonElement {
  const noop = vi.fn();
  render(
    <>
      {/* Stand-in for a widget text input elsewhere on the dashboard — isEscapeFromWidgetInput() keys off the [data-draggable-window] ancestor. */}
      <div data-draggable-window="">
        <input aria-label="Widget text field" />
      </div>
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
    </>
  );
  const trigger = screen.getByText('My Folder').closest('button');
  fireEvent.click(trigger as HTMLButtonElement);
  return trigger as HTMLButtonElement;
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

    // Stand-in for DashboardView's window-level global Escape handler.
    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });

  it('returns focus to the folder trigger button after Escape', () => {
    const trigger = renderPopover();

    fireEvent.keyDown(document, { key: 'Escape', bubbles: true });

    expect(document.activeElement).toBe(trigger);
  });

  it('leaves the popover open when Escape comes from a widget text input', () => {
    renderPopover();
    expect(screen.getByText('Clock')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText('Widget text field'), {
      key: 'Escape',
      bubbles: true,
    });

    // Escape belongs to the input; the dock popover must not consume it.
    expect(screen.getByText('Clock')).toBeInTheDocument();
  });
});
