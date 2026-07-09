import { arrayMove } from '@dnd-kit/sortable';
import { WidgetType, InternalToolType } from '@/types';

// Hidden only when empty AND not in edit mode — edit mode keeps it reachable for rename/delete.
export function shouldShowFolder(
  isEditMode: boolean,
  items: (WidgetType | InternalToolType)[] | undefined,
  canAccessTool: (type: WidgetType | InternalToolType) => boolean
): boolean {
  // Guard undefined: Firestore/localStorage load dock data with a bare cast, no per-item shape validation.
  return isEditMode || (items ?? []).some(canAccessTool);
}

// Reorders allItems to match a visible-only drag while permission-gated items keep their absolute slot; null if either type isn't visible.
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
