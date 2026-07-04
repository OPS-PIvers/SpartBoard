import { describe, it, expect } from 'vitest';
import { shouldShowFolder, reorderPreservingHidden } from './folderPermissions';

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
