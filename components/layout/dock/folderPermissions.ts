import { arrayMove } from '@dnd-kit/sortable';
import { WidgetType, InternalToolType } from '@/types';

/**
 * A Dock folder is hidden only when it has no accessible items AND the dock
 * isn't in edit mode. Edit mode always shows it so a teacher can reach
 * rename/delete controls on a newly-created empty folder, one drained down
 * to its last item, or one whose contents are all currently permission-gated
 * — none of those should become an orphaned, unreachable Firestore entry.
 */
export function shouldShowFolder(
  isEditMode: boolean,
  items: (WidgetType | InternalToolType)[] | undefined,
  canAccessTool: (type: WidgetType | InternalToolType) => boolean
): boolean {
  // Firestore/localStorage load dock data with a bare cast and no per-item
  // shape validation — a legacy or partially-written document can deliver
  // `items: undefined`. This is the first call site on that data, so guard
  // here rather than let `.some` throw and crash the whole Dock render.
  return isEditMode || (items ?? []).some(canAccessTool);
}

/**
 * Reorders `allItems` so the relative order of `visibleItems` matches a drag
 * from `activeType` to `overType`, while every hidden (permission-gated)
 * item keeps its original absolute slot — a restored permission must return
 * the item to where it was, not wherever the visible-only reorder landed.
 * Returns `null` if either type isn't currently visible (nothing to do).
 */
export function reorderPreservingHidden(
  allItems: (WidgetType | InternalToolType)[],
  visibleItems: (WidgetType | InternalToolType)[],
  activeType: WidgetType | InternalToolType,
  overType: WidgetType | InternalToolType
): (WidgetType | InternalToolType)[] | null {
  const oldVisibleIndex = visibleItems.indexOf(activeType);
  const newVisibleIndex = visibleItems.indexOf(overType);
  if (oldVisibleIndex === -1 || newVisibleIndex === -1) return null;
  const reorderedVisible = arrayMove(
    visibleItems,
    oldVisibleIndex,
    newVisibleIndex
  );
  const visibleSet = new Set(visibleItems);
  let cursor = 0;
  return allItems.map((item) =>
    visibleSet.has(item) ? reorderedVisible[cursor++] : item
  );
}
