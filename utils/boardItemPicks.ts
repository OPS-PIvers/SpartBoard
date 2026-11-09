// Library items a teacher put on a live shared board themselves; only those are published to its members.

import { arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { isViewAsTab } from '@/utils/viewAsTab';
import type { SharedBoardItemKind } from '@/utils/sharedBoardItems';
import type { WidgetType } from '@/types';

/** The config key that names each widget's library item, and the item's shared-board kind. */
const ITEM_KEYS: Partial<
  Record<WidgetType, { key: string; kind: SharedBoardItemKind }>
> = {
  quiz: { key: 'selectedQuizId', kind: 'quiz' },
  'video-activity': { key: 'selectedActivityId', kind: 'videoActivity' },
  'guided-learning': { key: 'playerSetId', kind: 'guidedLearning' },
  flashcards: { key: 'presentSetId', kind: 'flashcards' },
  smartNotebook: { key: 'activeNotebookId', kind: 'notebook' },
  projects: { key: 'projectId', kind: 'project' },
};

/** `users/{uid}/board_item_picks/{shareId}`; firestore.rules lets only `uid` write it. */
const picksRef = (uid: string, shareId: string) =>
  doc(db, 'users', uid, 'board_item_picks', shareId);

export function boardItemPickKey(
  kind: SharedBoardItemKind,
  itemId: string
): string {
  return `${kind}_${itemId}`;
}

/** The item a widget config names, as a pick key; null for widgets that show no library item. */
export function boardItemPickOf(
  type: WidgetType,
  config: Record<string, unknown> | undefined
): string | null {
  const ref = ITEM_KEYS[type];
  const id = ref ? config?.[ref.key] : undefined;
  return ref && typeof id === 'string' && id
    ? boardItemPickKey(ref.kind, id)
    : null;
}

/** The item a local config patch newly puts on a widget; an unchanged key in a spread config is not a pick. */
export function boardItemPickFromPatch(
  type: WidgetType,
  before: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined
): string | null {
  const ref = ITEM_KEYS[type];
  if (!ref || !patch || !(ref.key in patch)) return null;
  if (patch[ref.key] === before?.[ref.key]) return null;
  return boardItemPickOf(type, patch);
}

/** Records the teacher's own picks for a share. Never throws; a missed pick only holds the copy back. */
export async function recordBoardItemPicks(
  uid: string,
  shareId: string,
  keys: readonly string[]
): Promise<void> {
  // A View as tab's board edits wait for approval, so they pick nothing for the teacher.
  if (!keys.length || isViewAsTab) return;
  try {
    await setDoc(
      picksRef(uid, shareId),
      { items: arrayUnion(...keys) },
      { merge: true }
    );
  } catch (err) {
    logError('recordBoardItemPicks', err, { shareId });
  }
}

/** Whether `uid` put this item on the share's board themselves. */
export async function isBoardItemPicked(
  uid: string,
  shareId: string,
  key: string
): Promise<boolean> {
  const snap = await getDoc(picksRef(uid, shareId));
  const items: unknown = snap.exists() ? snap.data().items : undefined;
  return Array.isArray(items) && items.includes(key);
}
