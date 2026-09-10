// Pure helpers for note action items (§3.5/§7.4); legacy todos import here.

import { PlcActionItem, PlcMeeting, PlcNote, PlcTodo } from '@/types';

/** Hard cap on action items per note, mirrored in `firestore.rules`. */
export const MAX_ACTION_ITEMS = 200;

/** Build a new action item with a fresh id. */
export function newActionItem(
  text: string,
  createdBy: string,
  now: number,
  opts?: { assigneeUid?: string | null; dueAt?: number | null }
): PlcActionItem {
  const item: PlcActionItem = {
    id: crypto.randomUUID(),
    text,
    done: false,
    createdBy,
    createdAt: now,
  };
  if (opts?.assigneeUid !== undefined) item.assigneeUid = opts.assigneeUid;
  if (opts?.dueAt !== undefined) item.dueAt = opts.dueAt;
  return item;
}

/** Trim text, drop empties, null out undefined optionals, cap the list. */
export function sanitizeActionItemsForWrite(
  items: readonly PlcActionItem[]
): PlcActionItem[] {
  const cleaned: PlcActionItem[] = [];
  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;
    cleaned.push({
      id: item.id,
      text,
      done: item.done,
      assigneeUid: item.assigneeUid ?? null,
      dueAt: item.dueAt ?? null,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      doneAt: item.doneAt ?? null,
    });
    if (cleaned.length >= MAX_ACTION_ITEMS) break;
  }
  return cleaned;
}

/** Tolerant parse of a note's `actionItems` field from raw Firestore data. */
export function parseActionItems(raw: unknown): PlcActionItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PlcActionItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (
      typeof e.id !== 'string' ||
      typeof e.text !== 'string' ||
      typeof e.done !== 'boolean' ||
      typeof e.createdBy !== 'string' ||
      typeof e.createdAt !== 'number'
    ) {
      continue;
    }
    const item: PlcActionItem = {
      id: e.id,
      text: e.text,
      done: e.done,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
    };
    if (typeof e.assigneeUid === 'string') item.assigneeUid = e.assigneeUid;
    else if (e.assigneeUid === null) item.assigneeUid = null;
    if (typeof e.dueAt === 'number') item.dueAt = e.dueAt;
    else if (e.dueAt === null) item.dueAt = null;
    if (typeof e.doneAt === 'number') item.doneAt = e.doneAt;
    else if (e.doneAt === null) item.doneAt = null;
    items.push(item);
  }
  return items;
}

export interface OpenActionItemGroup {
  note: PlcNote;
  items: PlcActionItem[];
}

/** Open items grouped by live note, newest-edited note first. */
export function openActionItemsByNote(
  notes: readonly PlcNote[]
): OpenActionItemGroup[] {
  const groups: OpenActionItemGroup[] = [];
  for (const note of notes) {
    if (note.deletedAt != null) continue;
    const open = (note.actionItems ?? []).filter((item) => !item.done);
    if (open.length === 0) continue;
    groups.push({ note, items: open });
  }
  groups.sort((a, b) => b.note.lastEditedAt - a.note.lastEditedAt);
  return groups;
}

/** Total count of open action items across all live notes. */
export function countOpenActionItems(notes: readonly PlcNote[]): number {
  let count = 0;
  for (const note of notes) {
    if (note.deletedAt != null) continue;
    for (const item of note.actionItems ?? []) {
      if (!item.done) count++;
    }
  }
  return count;
}

/** Filter to live (non-deleted) legacy to-dos. */
export function liveTodos(todos: readonly PlcTodo[]): PlcTodo[] {
  return todos.filter((todo) => todo.deletedAt == null);
}

export const IMPORTED_TODOS_NOTE_TITLE = 'Imported to-dos';

/** Note payload for a to-do import; item ids reuse todo ids so reruns merge. */
export function buildImportedTodosNote(
  todos: readonly PlcTodo[],
  uid: string,
  now: number
): { title: string; body: string; actionItems: PlcActionItem[] } {
  const actionItems: PlcActionItem[] = todos.map((todo) => {
    const item: PlcActionItem = {
      id: todo.id,
      text: todo.text,
      done: todo.done,
      createdBy: todo.createdBy,
      createdAt: todo.createdAt,
    };
    if (todo.assigneeUid !== undefined) item.assigneeUid = todo.assigneeUid;
    if (todo.dueAt !== undefined) item.dueAt = todo.dueAt;
    return item;
  });
  return {
    title: IMPORTED_TODOS_NOTE_TITLE,
    body: `Imported ${todos.length} to-do${todos.length === 1 ? '' : 's'} from the legacy PLC to-do list on ${new Date(now).toLocaleDateString()}.`,
    actionItems,
  };
}

/** Build an action item from a meeting's action-item entry. */
export function actionItemFromMeetingItem(
  item: PlcMeeting['actionItems'][number],
  createdBy: string,
  now: number
): PlcActionItem {
  const result: PlcActionItem = {
    id: item.id,
    text: item.text,
    done: false,
    createdBy,
    createdAt: now,
  };
  if (item.assigneeUid !== undefined) result.assigneeUid = item.assigneeUid;
  if (item.dueAt !== undefined) result.dueAt = item.dueAt;
  return result;
}

/** Append `incoming` items whose id isn't already present in `existing`. */
export function mergeActionItems(
  existing: readonly PlcActionItem[],
  incoming: readonly PlcActionItem[]
): PlcActionItem[] {
  const existingIds = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (existingIds.has(item.id)) continue;
    existingIds.add(item.id);
    merged.push(item);
  }
  return merged;
}
