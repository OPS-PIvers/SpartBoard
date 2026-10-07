// "My items" (T10, T14): my open action items across notes, plus ones I finished lately.

import type { PlcNote } from '@/types';
import {
  selectMyActionItems,
  type ActionItemView,
} from '@/components/plc/home/cards/yourActionItems';

const RECENT_DONE_MS = 14 * 24 * 60 * 60 * 1000;
const RECENT_DONE_LIMIT = 5;

export interface MyItems {
  open: ActionItemView[];
  done: ActionItemView[];
}

export function selectMyItems(
  notes: readonly PlcNote[],
  uid: string | null,
  now: number
): MyItems {
  const open = selectMyActionItems(notes, uid, now);
  if (!uid) return { open, done: [] };
  const done: ActionItemView[] = [];
  for (const note of notes) {
    if (note.deletedAt != null) continue;
    for (const item of note.actionItems ?? []) {
      if (!item.done || item.assigneeUid !== uid) continue;
      if (item.doneAt == null || now - item.doneAt > RECENT_DONE_MS) continue;
      done.push({ note, item, bucket: 'none' });
    }
  }
  done.sort((a, b) => (b.item.doneAt ?? 0) - (a.item.doneAt ?? 0));
  return { open, done: done.slice(0, RECENT_DONE_LIMIT) };
}
