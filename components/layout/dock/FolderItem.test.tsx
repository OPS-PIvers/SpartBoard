import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { FolderItem } from './FolderItem';
import type { DockFolder } from '@/types';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

// FolderItem's closed-folder button renders <DockLabel>, which reads global
// style off the dashboard-canvas store context (`useGlobalStyle`) rather than
// the `globalStyle` prop threaded through the rest of the tree. Mock it so
// this test doesn't need a full DashboardProvider just for a label color.
vi.mock('@/context/dashboardCanvasStore', () => ({
  useGlobalStyle: () => DEFAULT_GLOBAL_STYLE,
}));

// FolderItem calls the outer useSortable() (for dragging the folder itself
// within the dock) unconditionally, so it must be rendered inside a
// DndContext/SortableContext even when the test never drags anything.
const renderFolderItem = (
  props: Partial<React.ComponentProps<typeof FolderItem>> & {
    folder: DockFolder;
    canAccessTool: (type: string) => boolean;
  }
) => {
  const noop = vi.fn();
  return render(
    <DndContext>
      <SortableContext items={[props.folder.id]}>
        <FolderItem
          onAdd={noop}
          onRename={noop}
          onDelete={noop}
          isEditMode={false}
          onLongPress={noop}
          minimizedWidgetsByType={{} as never}
          onRemoveItem={noop}
          onReorder={noop}
          globalStyle={DEFAULT_GLOBAL_STYLE}
          {...props}
        />
      </SortableContext>
    </DndContext>
  );
};

const folder: DockFolder = {
  id: 'folder-1',
  name: 'My Folder',
  // 'clock' and 'time-tool' are both real WidgetType entries in TOOLS
  // (config/tools.ts) with distinct, human-readable labels ("Clock",
  // "Timer") we can assert on directly.
  items: ['clock', 'time-tool'],
};

describe('FolderItem permission gating', () => {
  it('renders every item when the user can access all of them', () => {
    renderFolderItem({ folder, canAccessTool: () => true });

    fireEvent.click(screen.getByText('My Folder'));

    expect(screen.getByText('Clock')).toBeInTheDocument();
    expect(screen.getByText('Timer')).toBeInTheDocument();
  });

  it('hides a folder item the user can no longer access, mirroring the top-level dock gate', () => {
    // Regression for the FolderItem permission bypass: Dock.tsx's top-level
    // items already skip rendering via `if (!tool || !canAccessTool(tool.type))
    // return null;`, but FolderItem rendered every entry in `folder.items`
    // unconditionally. A widget placed in a folder stayed clickable there
    // even after canAccessTool(type) started returning false (permission
    // revoked, building reassignment, admin-disabled feature).
    renderFolderItem({
      folder,
      canAccessTool: (type) => type !== 'time-tool',
    });

    fireEvent.click(screen.getByText('My Folder'));

    expect(screen.getByText('Clock')).toBeInTheDocument();
    expect(screen.queryByText('Timer')).not.toBeInTheDocument();
  });

  it('does not let onAdd fire for an inaccessible item', () => {
    const onAdd = vi.fn();
    renderFolderItem({
      folder,
      canAccessTool: (type) => type !== 'time-tool',
      onAdd,
    });

    fireEvent.click(screen.getByText('My Folder'));

    // The accessible item still works — the label is a sibling <span>, not
    // inside the clickable <button>, so click the button in the same tile.
    const clockButton = screen
      .getByText('Clock')
      .closest('.group\\/item')
      ?.querySelector('button');
    expect(clockButton).toBeTruthy();
    fireEvent.click(clockButton as HTMLButtonElement);
    expect(onAdd).toHaveBeenCalledWith('clock');

    // …but the inaccessible one was never rendered, so there is no control
    // left to click that could call onAdd('time-tool').
    expect(screen.queryByText('Timer')).not.toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalledWith('time-tool');
  });

  it('shows the empty-folder placeholder when every item is inaccessible', () => {
    renderFolderItem({ folder, canAccessTool: () => false });

    fireEvent.click(screen.getByText('My Folder'));

    expect(screen.getByText('Drag items here to add them')).toBeInTheDocument();
    expect(screen.queryByText('Clock')).not.toBeInTheDocument();
    expect(screen.queryByText('Timer')).not.toBeInTheDocument();
  });
});
