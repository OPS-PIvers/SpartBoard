import { describe, it, expect } from 'vitest';
import {
  shouldShowFolder,
  reorderPreservingHidden,
  reorderDockItemsPreservingHidden,
  dockItemId,
} from './folderPermissions';
import type { DockItem } from '@/types';

describe('shouldShowFolder', () => {
  it('hides a folder with no items when not in edit mode (Array.prototype.some on [] is always false)', () => {
    // Regression: `!isEditMode && !items.some(...)` must not permanently
    // hide a freshly-created folder (addFolder seeds items: []) or one
    // drained to empty one item at a time (moveItemOutOfFolder) — both are
    // legitimate mid-edit states, not "some/all items gated" states.
    expect(shouldShowFolder(false, [], () => true)).toBe(false);
  });

  it('shows a folder with no items while in edit mode, so it stays reachable to populate or delete', () => {
    expect(shouldShowFolder(true, [], () => true)).toBe(true);
  });

  it('shows an all-gated folder while in edit mode, so rename/delete controls stay reachable', () => {
    expect(shouldShowFolder(true, ['clock', 'time-tool'], () => false)).toBe(
      true
    );
  });

  it('hides an all-gated folder when not in edit mode', () => {
    expect(shouldShowFolder(false, ['clock', 'time-tool'], () => false)).toBe(
      false
    );
  });

  it('shows a folder with at least one accessible item regardless of edit mode', () => {
    const canAccessTool = (t: string) => t === 'clock';
    expect(shouldShowFolder(false, ['clock', 'time-tool'], canAccessTool)).toBe(
      true
    );
    expect(shouldShowFolder(true, ['clock', 'time-tool'], canAccessTool)).toBe(
      true
    );
  });

  it('does not throw when items is undefined (legacy/partially-written Firestore doc)', () => {
    // Firestore and localStorage load dock data with a bare type cast and no
    // per-item shape validation; DockFolder.items is typed as required but a
    // legacy document could omit it at runtime.
    expect(() => shouldShowFolder(false, undefined, () => true)).not.toThrow();
    expect(shouldShowFolder(false, undefined, () => true)).toBe(false);
    expect(shouldShowFolder(true, undefined, () => true)).toBe(true);
  });
});

describe('reorderPreservingHidden', () => {
  // 'clock' and 'time-tool' stand in for visible items; 'weather' stands in
  // for a permission-gated (hidden) item that must not move.
  it('reorders visible items while leaving a hidden item at its original absolute index', () => {
    // folder.items = ['clock', 'weather'(hidden), 'time-tool'];
    // visibleItems = ['clock', 'time-tool']. Dragging 'time-tool' before
    // 'clock' in visible-space must NOT shift 'weather' out of index 1 — a
    // restored permission should find it exactly where it was left.
    const result = reorderPreservingHidden(
      ['clock', 'weather', 'time-tool'],
      ['clock', 'time-tool'],
      'time-tool',
      'clock'
    );

    expect(result).toEqual(['time-tool', 'weather', 'clock']);
  });

  it('returns null when the dragged or drop-target type is not currently visible', () => {
    const result = reorderPreservingHidden(
      ['clock', 'weather', 'time-tool'],
      ['clock', 'time-tool'],
      'weather',
      'clock'
    );
    expect(result).toBeNull();
  });

  it('reorders correctly when nothing is hidden (visibleItems === allItems)', () => {
    const result = reorderPreservingHidden(
      ['clock', 'time-tool'],
      ['clock', 'time-tool'],
      'clock',
      'time-tool'
    );
    expect(result).toEqual(['time-tool', 'clock']);
  });
});

describe('reorderDockItemsPreservingHidden', () => {
  // Top-level dock sequence: 'clock' and 'time-tool' are ordinary tools the
  // user can drag; 'weather' stands in for a tool gated behind a beta/admin
  // FeaturePermission the user doesn't currently have, so it renders nothing
  // and can never itself be the dragged or dropped-on entry.
  const clock: DockItem = { type: 'tool', toolType: 'clock' };
  const weather: DockItem = { type: 'tool', toolType: 'weather' };
  const timeTool: DockItem = { type: 'tool', toolType: 'time-tool' };
  const isVisible = (item: DockItem) =>
    item.type !== 'tool' || item.toolType !== 'weather';

  it('reorders visible entries while leaving a permission-gated tool at its original absolute index', () => {
    // Regression: dnd-kit hands us the visible drag/drop ids, but the prior
    // implementation ran arrayMove over the *full* dockItems array — so
    // dragging 'time-tool' before 'clock' also silently dragged the hidden
    // 'weather' entry from index 1 to index 2 even though nothing about it
    // was ever visible or interacted with.
    const result = reorderDockItemsPreservingHidden(
      [clock, weather, timeTool],
      isVisible,
      'time-tool',
      'clock'
    );
    expect(result?.map(dockItemId)).toEqual(['time-tool', 'weather', 'clock']);
  });

  it('returns null when the dragged or drop-target entry is not currently visible', () => {
    const result = reorderDockItemsPreservingHidden(
      [clock, weather, timeTool],
      isVisible,
      'weather',
      'clock'
    );
    expect(result).toBeNull();
  });

  it('reorders folder ids the same way as tool ids', () => {
    const folderA: DockItem = {
      type: 'folder',
      folder: { id: 'folder-a', name: 'A', items: [] },
    };
    const result = reorderDockItemsPreservingHidden(
      [clock, weather, folderA],
      (item) => item !== weather,
      'folder-a',
      'clock'
    );
    expect(result?.map(dockItemId)).toEqual(['folder-a', 'weather', 'clock']);
  });
});

describe('dockItemId', () => {
  it('reads toolType for a tool entry and folder.id for a folder entry', () => {
    expect(dockItemId({ type: 'tool', toolType: 'clock' })).toBe('clock');
    expect(
      dockItemId({
        type: 'folder',
        folder: { id: 'folder-1', name: 'F', items: [] },
      })
    ).toBe('folder-1');
  });
});
