import type { SharedCollection } from '@/types';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

const UNKNOWN_TEACHER = 'A teacher in this building';

export interface DirectoryBoardLink {
  id: string;
  /** Absent on pre-v2 shares, which carry only board ids. */
  name?: string;
}

export type DirectoryEntry =
  | {
      kind: 'board';
      key: string;
      teacherName: string;
      boardName: string;
      widgetCount?: number;
      expiresAt?: number;
      /** Legacy `/shared_boards` share id. */
      shareId: string;
    }
  | {
      kind: 'collection-board';
      key: string;
      teacherName: string;
      boardName: string;
      expiresAt?: number;
      shareId: string;
      boardId: string;
    }
  | {
      kind: 'collection';
      key: string;
      teacherName: string;
      collectionName: string;
      color?: string;
      expiresAt?: number;
      shareId: string;
      boards: DirectoryBoardLink[];
    };

/** A collection share's boards in walk order, named where the share names them. */
export function collectionBoardLinks(
  c: SharedCollection
): DirectoryBoardLink[] {
  const named = new Map((c.boards ?? []).map((b) => [b.id, b] as const));
  const ordered = c.boards?.length
    ? [...c.boards].sort((a, b) => a.order - b.order).map((b) => b.id)
    : c.boardIds;
  return ordered.map((id) => {
    const name = named.get(id)?.name?.trim();
    return name ? { id, name } : { id };
  });
}

/**
 * One card per share, grouped by teacher. A single board shared on its own is
 * stored as a one-board collection share, so it lists as a board here.
 */
export function buildDirectoryEntries(
  boardShares: SubstituteShareDoc[],
  collectionShares: SharedCollection[]
): DirectoryEntry[] {
  const entries: DirectoryEntry[] = boardShares.map((share) => ({
    kind: 'board',
    key: `board:${share.shareId}`,
    teacherName: share.originalAuthorName ?? UNKNOWN_TEACHER,
    boardName: share.name ?? 'Untitled board',
    widgetCount:
      share.widgetCount ??
      (Array.isArray(share.widgets) ? share.widgets.length : undefined),
    expiresAt: share.expiresAt,
    shareId: share.shareId,
  }));

  for (const c of collectionShares) {
    const teacherName = c.hostDisplayName ?? UNKNOWN_TEACHER;
    const links = collectionBoardLinks(c);
    if (c.kind === 'board' && links.length === 1) {
      entries.push({
        kind: 'collection-board',
        key: `collection:${c.shareId}`,
        teacherName,
        boardName: links[0].name ?? c.collection.name ?? 'Untitled board',
        expiresAt: c.expiresAt,
        shareId: c.shareId,
        boardId: links[0].id,
      });
      continue;
    }
    entries.push({
      kind: 'collection',
      key: `collection:${c.shareId}`,
      teacherName,
      collectionName: c.collection.name,
      ...(c.collection.color !== undefined && { color: c.collection.color }),
      expiresAt: c.expiresAt,
      shareId: c.shareId,
      boards: links,
    });
  }

  return entries.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
}
