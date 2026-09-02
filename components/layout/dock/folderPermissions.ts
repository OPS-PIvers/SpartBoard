import { arrayMove } from '@dnd-kit/sortable';
import { WidgetType, InternalToolType, DockItem } from '@/types';

// Hidden only when empty AND not in edit mode — edit mode keeps it reachable for rename/delete.
export function shouldShowFolder(
  isEditMode: boolean,
  items: (WidgetType | InternalToolType)[] | undefined,
  canAccessTool: (type: WidgetType | InternalToolType) => boolean
): boolean {
  // Guard undefined: Firestore/localStorage load dock data with a bare cast, no per-item shape validation.
  return isEditMode || (items ?? []).some(canAccessTool);
}

// Reorders allItems to match a visible-only drag while permission-gated entries keep their absolute slot; null if either id isn't visible. Generic over any id-like value so both a folder's widget-type items and the dock's top-level tool/folder ids can share one implementation.
export function reorderPreservingHidden<T>(
  allItems: T[],
  visibleItems: T[],
  activeType: T,
  overType: T
): T[] | null {
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

// Stable id for a top-level dock entry — matches the ids handed to dnd-kit's SortableContext.
export function dockItemId(item: DockItem): string {
  return item.type === 'tool' ? item.toolType : item.folder.id;
}

// Same permission-gated-slot preservation as reorderPreservingHidden, applied to the dock's top-level tool/folder sequence.
export function reorderDockItemsPreservingHidden(
  allItems: DockItem[],
  isVisible: (item: DockItem) => boolean,
  activeId: string,
  overId: string
): DockItem[] | null {
  const visibleIds = allItems.filter(isVisible).map(dockItemId);
  const allIds = allItems.map(dockItemId);
  const reorderedIds = reorderPreservingHidden(
    allIds,
    visibleIds,
    activeId,
    overId
  );
  if (!reorderedIds) return null;
  const byId = new Map(allItems.map((item) => [dockItemId(item), item]));
  return reorderedIds
    .map((id) => byId.get(id))
    .filter((item): item is DockItem => item !== undefined);
}
