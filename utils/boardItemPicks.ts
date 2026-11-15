// Library items a teacher put on a live shared board themselves; only those are published to its members.

import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { isViewAsTab } from '@/utils/viewAsTab';
import type { SharedBoardItemKind } from '@/utils/sharedBoardItems';
import type { WidgetType } from '@/types';

/** The config keys that name each widget's library item and its stamped owner, and the item's shared-board kind. */
const ITEM_KEYS: Partial<
  Record<WidgetType, { key: string; owner: string; kind: SharedBoardItemKind }>
> = {
  quiz: { key: 'selectedQuizId', owner: 'selectedQuizOwnerUid', kind: 'quiz' },
  'video-activity': {
    key: 'selectedActivityId',
    owner: 'selectedActivityOwnerUid',
    kind: 'videoActivity',
  },
  'guided-learning': {
    key: 'playerSetId',
    owner: 'playerSetOwnerUid',
    kind: 'guidedLearning',
  },
  flashcards: {
    key: 'presentSetId',
    owner: 'presentSetOwnerUid',
    kind: 'flashcards',
  },
  smartNotebook: {
    key: 'activeNotebookId',
    owner: 'activeNotebookOwnerUid',
    kind: 'notebook',
  },
  projects: { key: 'projectId', owner: 'projectOwnerUid', kind: 'project' },
};

/** A widget as a board or share doc stores it, as far as picks need. */
export interface BoardItemWidget {
  type: WidgetType;
  config?: unknown;
}

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

/** The items a board's widgets name, less those stamped as another teacher's. */
export function ownBoardItemPicks(
  widgets: readonly BoardItemWidget[],
  uid: string
): string[] {
  const picks = new Set<string>();
  for (const w of widgets) {
    const config =
      w.config && typeof w.config === 'object'
        ? (w.config as Record<string, unknown>)
        : undefined;
    const ref = ITEM_KEYS[w.type];
    const owner = ref ? config?.[ref.owner] : undefined;
    if (typeof owner === 'string' && owner && owner !== uid) continue;
    const pick = boardItemPickOf(w.type, config);
    if (pick) picks.add(pick);
  }
  return [...picks];
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

/** The items `uid` put on the share's board themselves; null when the share has no picks doc, empty when unreadable. */
export async function readBoardItemPicks(
  uid: string,
  shareId: string
): Promise<string[] | null> {
  try {
    const snap = await getDoc(picksRef(uid, shareId));
    if (!snap.exists()) return null;
    const items: unknown = snap.data().items;
    return Array.isArray(items)
      ? items.filter((k): k is string => typeof k === 'string')
      : [];
  } catch (err) {
    logError('readBoardItemPicks', err, { shareId });
    return [];
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

/** Calls `onPicked` once `uid` records this pick, from any tab or device. */
export function watchBoardItemPick(
  uid: string,
  shareId: string,
  key: string,
  onPicked: () => void
): () => void {
  return onSnapshot(
    picksRef(uid, shareId),
    (snap) => {
      const items: unknown = snap.exists() ? snap.data().items : undefined;
      if (Array.isArray(items) && items.includes(key)) onPicked();
    },
    (err) => logError('watchBoardItemPick', err, { shareId })
  );
}

// Per `uid/shareId`, this session's seed of a share's picks: true when picks were written.
const seeds = new Map<string, Promise<boolean>>();

const isBoardItemWidget = (w: unknown): w is BoardItemWidget =>
  !!w &&
  typeof w === 'object' &&
  typeof (w as { type?: unknown }).type === 'string';

/** Lets publishers on a share just made wait for its share-time picks instead of seeding their own. */
export function noteBoardItemPicksSeeding(
  uid: string,
  shareId: string,
  seeding: Promise<void>
): void {
  seeds.set(
    `${uid}/${shareId}`,
    seeding.then(
      () => true,
      () => true
    )
  );
}

// Shares made before this cutoff predate picks; later ones get their picks at share time.
export const LEGACY_PICKS_SHARE_CUTOFF_MS = Date.UTC(2026, 10, 9, 12);

/** A share made before picks existed: picks the teacher's own items its board names, once per teacher and share. */
export function seedLegacyBoardItemPicks(
  uid: string,
  shareId: string
): Promise<boolean> {
  const id = `${uid}/${shareId}`;
  const known = seeds.get(id);
  if (known) return known;
  const run = (async () => {
    if (isViewAsTab) return false;
    const share = await getDoc(doc(db, 'shared_boards', shareId));
    if (!share.exists()) return false;
    const data = share.data();
    const sharedAt: unknown = data.sharedAt;
    if (
      typeof sharedAt === 'number' &&
      sharedAt >= LEGACY_PICKS_SHARE_CUTOFF_MS
    )
      return false;
    const picks = await getDoc(picksRef(uid, shareId));
    if (picks.exists() && picks.data().legacySeeded === true) return false;
    const widgets: unknown = data.widgets;
    const keys = Array.isArray(widgets)
      ? ownBoardItemPicks(widgets.filter(isBoardItemWidget), uid)
      : [];
    await setDoc(
      picksRef(uid, shareId),
      keys.length
        ? { items: arrayUnion(...keys), legacySeeded: true }
        : { legacySeeded: true },
      { merge: true }
    );
    return keys.length > 0;
  })().catch((err: unknown) => {
    seeds.delete(id);
    logError('seedLegacyBoardItemPicks', err, { shareId });
    return false;
  });
  seeds.set(id, run);
  return run;
}

/** Test hook: forget which shares this tab already seeded. */
export function resetBoardItemPickSeeds(): void {
  seeds.clear();
}
