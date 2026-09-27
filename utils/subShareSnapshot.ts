/**
 * Shaping a Collection into a substitute share (docs/plans/shipped/SUB_SHARE_COLLECTIONS.md §3.1).
 *
 * A sub share carries the boards a teacher would click through, grouped the way
 * the teacher groups them and walked in the same order, plus the rosters those
 * boards read. The teacher's client builds this — nothing here touches
 * Firestore.
 */

import type {
  Collection,
  Dashboard,
  SharedCollectionBoardEntry,
  SharedCollectionSection,
} from '@/types';

/** Widget-config keys holding remembered roster picks, e.g. `lastRosterIdsByQuizId`. */
const REMEMBERED_ROSTER_KEY = /^lastRosterIdsBy/;

export interface SharedCollectionTree {
  sections: SharedCollectionSection[];
  boards: SharedCollectionBoardEntry[];
  /** The shared boards themselves, in walk order. */
  orderedBoards: Dashboard[];
}

const byOrder = <T extends { order?: number; name?: string }>(a: T, b: T) =>
  (a.order ?? 0) - (b.order ?? 0) || (a.name ?? '').localeCompare(b.name ?? '');

/**
 * Depth-first walk of `rootId` and its sub-collections: the root's own boards
 * first, then each sub-collection's, so prev/next crosses sections in the order
 * the teacher sees them (D5). Cycle-safe — a collection already visited is
 * skipped, so a corrupt parent chain cannot hang the share.
 */
export function flattenSharedCollection(
  root: Collection,
  collections: Collection[],
  allBoards: Dashboard[]
): SharedCollectionTree {
  const sections: SharedCollectionSection[] = [];
  const boards: SharedCollectionBoardEntry[] = [];
  const orderedBoards: Dashboard[] = [];
  const seen = new Set<string>();

  const visit = (collection: Collection) => {
    if (seen.has(collection.id)) return;
    seen.add(collection.id);
    sections.push({
      id: collection.id,
      name: collection.name,
      ...(collection.color !== undefined && { color: collection.color }),
    });
    for (const board of allBoards
      .filter((b) => (b.collectionId ?? null) === collection.id)
      .sort(byOrder)) {
      boards.push({
        id: board.id,
        name: board.name,
        sectionId: collection.id,
        order: boards.length,
      });
      orderedBoards.push(board);
    }
    for (const child of collections
      .filter((c) => c.parentCollectionId === collection.id)
      .sort(byOrder)) {
      visit(child);
    }
  };

  visit(root);
  return { sections, boards, orderedBoards };
}

/** A single Board shared on its own, as a one-section, one-board share (A1). */
export function singleBoardTree(board: Dashboard): SharedCollectionTree {
  return {
    sections: [{ id: board.id, name: board.name }],
    boards: [{ id: board.id, name: board.name, sectionId: board.id, order: 0 }],
    orderedBoards: [board],
  };
}

/**
 * Roster ids the shared boards read: the active roster (every widget in
 * `rosterMode: 'class'` resolves to it) plus every roster remembered by a
 * quiz / video activity / guided learning / mini-app picker.
 */
export function collectShareRosterIds(
  boards: Dashboard[],
  activeRosterId: string | null | undefined
): string[] {
  const ids = new Set<string>();
  if (activeRosterId) ids.add(activeRosterId);
  for (const board of boards) {
    for (const widget of board.widgets) {
      const config = widget.config as Record<string, unknown>;
      for (const key of Object.keys(config)) {
        if (!REMEMBERED_ROSTER_KEY.test(key)) continue;
        const remembered = config[key];
        if (typeof remembered !== 'object' || remembered === null) continue;
        for (const value of Object.values(remembered)) {
          if (!Array.isArray(value)) continue;
          for (const id of value) if (typeof id === 'string' && id) ids.add(id);
        }
      }
    }
  }
  return [...ids];
}

/** Walk order position of `boardId`, or -1. Used by /subs prev/next. */
export function boardWalkIndex(
  boards: SharedCollectionBoardEntry[] | undefined,
  boardId: string
): number {
  return (boards ?? []).findIndex((b) => b.id === boardId);
}

/** The board a sub lands on: the collection's default, else first in walk order. */
export function landingBoardId(
  boards: SharedCollectionBoardEntry[] | undefined,
  boardIds: string[],
  defaultBoardId?: string
): string | undefined {
  const ordered = boards ?? [];
  if (defaultBoardId && ordered.some((b) => b.id === defaultBoardId))
    return defaultBoardId;
  if (
    defaultBoardId &&
    ordered.length === 0 &&
    boardIds.includes(defaultBoardId)
  )
    return defaultBoardId;
  return ordered[0]?.id ?? boardIds[0];
}
