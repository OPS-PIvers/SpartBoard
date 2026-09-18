// Pure sort/filter helpers for a note's action-item list (§7.4).

import type { PlcActionItem } from '@/types';

export type ActionItemSort =
  | 'manual'
  | 'status'
  | 'due'
  | 'assignee'
  | 'created'
  | 'text';

export type ActionItemStatusFilter = 'all' | 'open' | 'done';

export type ActionItemDueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

/** `'all'`, `'unassigned'`, or a member uid. */
export type ActionItemAssigneeFilter = string;

export interface ActionItemView {
  sort: ActionItemSort;
  status: ActionItemStatusFilter;
  due: ActionItemDueFilter;
  assignee: ActionItemAssigneeFilter;
}

export const DEFAULT_ACTION_ITEM_VIEW: ActionItemView = {
  sort: 'manual',
  status: 'all',
  due: 'all',
  assignee: 'all',
};

export const ACTION_ITEM_SORTS: readonly ActionItemSort[] = [
  'manual',
  'status',
  'due',
  'assignee',
  'created',
  'text',
];

export const ACTION_ITEM_STATUS_FILTERS: readonly ActionItemStatusFilter[] = [
  'all',
  'open',
  'done',
];

export const ACTION_ITEM_DUE_FILTERS: readonly ActionItemDueFilter[] = [
  'all',
  'overdue',
  'today',
  'week',
  'none',
];

/** True when nothing is sorted or filtered — the stored order, whole list. */
export function isDefaultActionItemView(view: ActionItemView): boolean {
  return (
    view.sort === DEFAULT_ACTION_ITEM_VIEW.sort &&
    view.status === DEFAULT_ACTION_ITEM_VIEW.status &&
    view.due === DEFAULT_ACTION_ITEM_VIEW.due &&
    view.assignee === DEFAULT_ACTION_ITEM_VIEW.assignee
  );
}

/** Local midnight `days` from the day containing `ms`. */
function dayStart(ms: number, days = 0): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Open and past its due date. Due dates are stored at local midnight, so the
 * comparison is against the start of today — an item due today isn't late yet.
 */
export function isActionItemOverdue(item: PlcActionItem, now: number): boolean {
  return !item.done && item.dueAt != null && item.dueAt < dayStart(now);
}

function matchesDue(
  item: PlcActionItem,
  due: ActionItemDueFilter,
  now: number
): boolean {
  if (due === 'all') return true;
  if (due === 'none') return item.dueAt == null;
  if (due === 'overdue') return isActionItemOverdue(item, now);
  if (item.dueAt == null) return false;
  const from = dayStart(now);
  const to = dayStart(now, due === 'today' ? 1 : 7);
  return item.dueAt >= from && item.dueAt < to;
}

/** Apply the status / due / assignee filters, preserving order. */
export function filterActionItems(
  items: readonly PlcActionItem[],
  view: ActionItemView,
  now: number
): PlcActionItem[] {
  return items.filter((item) => {
    if (view.status === 'open' && item.done) return false;
    if (view.status === 'done' && !item.done) return false;
    if (view.assignee === 'unassigned' && item.assigneeUid != null)
      return false;
    if (
      view.assignee !== 'all' &&
      view.assignee !== 'unassigned' &&
      item.assigneeUid !== view.assignee
    ) {
      return false;
    }
    return matchesDue(item, view.due, now);
  });
}

/** Undated items sort last whichever direction the caller reads. */
function compareDue(a: PlcActionItem, b: PlcActionItem): number {
  const av = a.dueAt ?? null;
  const bv = b.dueAt ?? null;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return av - bv;
}

function compareAssignee(
  a: PlcActionItem,
  b: PlcActionItem,
  nameFor: (uid: string) => string
): number {
  if (a.assigneeUid == null && b.assigneeUid == null) return 0;
  if (a.assigneeUid == null) return 1;
  if (b.assigneeUid == null) return -1;
  const an = nameFor(a.assigneeUid) || a.assigneeUid;
  const bn = nameFor(b.assigneeUid) || b.assigneeUid;
  return an.localeCompare(bn, undefined, { sensitivity: 'base' });
}

/**
 * Sort a (possibly filtered) list. `'manual'` returns the array untouched —
 * that stored order is what drag-and-drop writes. Every other sort is a view
 * over it and falls back to stored order for ties, so equal rows never shuffle.
 */
export function sortActionItems(
  items: readonly PlcActionItem[],
  sort: ActionItemSort,
  nameFor: (uid: string) => string
): PlcActionItem[] {
  if (sort === 'manual') return [...items];
  const decorated = items.map((item, index) => ({ item, index }));
  decorated.sort((a, b) => {
    let cmp = 0;
    if (sort === 'status') {
      cmp =
        Number(a.item.done) - Number(b.item.done) || compareDue(a.item, b.item);
    } else if (sort === 'due') {
      cmp = compareDue(a.item, b.item);
    } else if (sort === 'assignee') {
      cmp = compareAssignee(a.item, b.item, nameFor);
    } else if (sort === 'created') {
      cmp = b.item.createdAt - a.item.createdAt;
    } else if (sort === 'text') {
      cmp = a.item.text.localeCompare(b.item.text, undefined, {
        sensitivity: 'base',
      });
    }
    return cmp || a.index - b.index;
  });
  return decorated.map((d) => d.item);
}

/** The rows the editor renders for `view`. */
export function visibleActionItems(
  items: readonly PlcActionItem[],
  view: ActionItemView,
  now: number,
  nameFor: (uid: string) => string
): PlcActionItem[] {
  return sortActionItems(
    filterActionItems(items, view, now),
    view.sort,
    nameFor
  );
}

/**
 * Fold a reorder of the visible rows back into the full stored list.
 *
 * Hidden items keep their slots and the reordered rows refill the slots the
 * visible ones occupied, so dragging inside a filtered list moves an item
 * relative to its visible neighbours without disturbing anything filtered out.
 */
export function applyVisibleReorder(
  all: readonly PlcActionItem[],
  nextVisible: readonly PlcActionItem[]
): PlcActionItem[] {
  const visibleIds = new Set(nextVisible.map((item) => item.id));
  const queue = [...nextVisible];
  return all.map((item) =>
    visibleIds.has(item.id) ? (queue.shift() ?? item) : item
  );
}
