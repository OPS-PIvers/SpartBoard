// Pieces the wall library dialog and the on-widget library share.

import { useCallback, useEffect, useState } from 'react';
import { Copy, Eraser, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ActivityWallLibraryEntry } from '@/types';
import type {
  LibraryBadge,
  LibraryMenuAction,
  LibraryPrimaryAction,
} from '@/components/common/library/types';
import { useLibraryDelete } from '@/components/common/library/useLibraryDelete';
import { LIBRARY_ITEM_NOUNS } from '@/components/common/library/useLibraryDeleteConfirm';
import { activityWallSessionId } from '@/utils/activityWallLinks';
import { WallStillClosedError } from '@/utils/activityWallErrors';
import { LAYOUT_OPTIONS } from './editor/layoutOptions';

type AddToast = (message: string, tone: 'success' | 'error' | 'info') => void;

const layoutLabel = (entry: ActivityWallLibraryEntry): string =>
  LAYOUT_OPTIONS.find((option) => option.layout === entry.layout)?.label ??
  'Wall';

export const wallSubtitle = (
  entry: ActivityWallLibraryEntry,
  count: number | undefined
): string =>
  `${layoutLabel(entry)} · ${count ?? 0} post${count === 1 ? '' : 's'}`;

export const wallBadges = (
  entry: ActivityWallLibraryEntry,
  activeEntryId: string | null,
  extra: LibraryBadge[] = []
): LibraryBadge[] => [
  ...extra,
  {
    label: entry.acceptingResponses === false ? 'Closed' : 'Open',
    tone: entry.acceptingResponses === false ? 'neutral' : 'success',
  },
  ...(entry.id === activeEntryId
    ? ([{ label: 'On board', tone: 'info' }] as const)
    : []),
];

export const wallOpenAction = (
  onOpen: () => void,
  readOnly: boolean
): LibraryPrimaryAction => ({
  label: 'Open on board',
  icon: PlayCircle,
  onClick: onOpen,
  disabled: readOnly,
  disabledReason: 'This board is view-only.',
});

/** Edit, Duplicate, [extra], Clear posts, Delete: the order both libraries show. */
export const wallMenuActions = (handlers: {
  onEdit: () => void;
  onDuplicate: () => void;
  onClearPosts: () => void;
  onDelete: () => void;
  extra?: LibraryMenuAction[];
}): LibraryMenuAction[] => [
  { id: 'edit', label: 'Edit', icon: Pencil, onClick: handlers.onEdit },
  {
    id: 'duplicate',
    label: 'Duplicate',
    icon: Copy,
    onClick: handlers.onDuplicate,
  },
  ...(handlers.extra ?? []),
  {
    id: 'clear',
    label: 'Clear posts',
    icon: Eraser,
    onClick: handlers.onClearPosts,
  },
  {
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    destructive: true,
    onClick: handlers.onDelete,
  },
];

interface WallLibraryActionsOptions {
  /** False while the library is hidden; each show starts a fresh count pass. */
  active: boolean;
  uid: string | undefined;
  entries: ActivityWallLibraryEntry[];
  onDelete: (entryId: string) => Promise<void>;
  onClearPosts: (entryId: string) => Promise<void>;
  addToast: AddToast;
  confirm: (message: string) => Promise<boolean>;
}

/** Post counts, Clear posts and Delete for a wall library. */
export const useWallLibraryActions = ({
  active,
  uid,
  entries,
  onDelete,
  onClearPosts,
  addToast,
  confirm,
}: WallLibraryActionsOptions) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countedWhileActive, setCountedWhileActive] = useState(active);

  // Each show starts a fresh count pass so a reopened library never shows stale post totals.
  if (countedWhileActive !== active) {
    setCountedWhileActive(active);
    if (active) setCounts({});
  }

  // One aggregate count per wall, cached by entry id so re-sorting never re-bills it.
  const uncountedKey = entries
    .map((entry) => entry.id)
    .filter((id) => !(id in counts))
    .join(',');
  useEffect(() => {
    if (!active || !uid || !uncountedKey) return;
    let cancelled = false;
    void (async () => {
      const ids = uncountedKey.split(',');
      const resolved = await Promise.all(
        ids.map(async (id) => {
          try {
            const snap = await getCountFromServer(
              collection(
                db,
                'activity_wall_sessions',
                activityWallSessionId(uid, id),
                'submissions'
              )
            );
            return [id, snap.data().count] as const;
          } catch {
            return [id, 0] as const;
          }
        })
      );
      if (cancelled) return;
      setCounts((prev) => ({ ...prev, ...Object.fromEntries(resolved) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [active, uid, uncountedKey]);

  const clearPosts = useCallback(
    async (entry: ActivityWallLibraryEntry) => {
      if (!uid) return;
      if (
        !(await confirm(`Delete every post on "${entry.title || 'Untitled'}"?`))
      ) {
        return;
      }
      try {
        await onClearPosts(entry.id);
        setCounts((prev) => ({ ...prev, [entry.id]: 0 }));
        addToast('Posts cleared.', 'success');
      } catch (err) {
        if (err instanceof WallStillClosedError) {
          setCounts((prev) => ({ ...prev, [entry.id]: 0 }));
          addToast('Posts cleared. Open the wall again for students.', 'error');
          return;
        }
        console.error('[ActivityWall] Failed to clear posts:', err);
        addToast('Could not clear posts.', 'error');
      }
    },
    [addToast, confirm, onClearPosts, uid]
  );

  const wallDelete = useLibraryDelete<ActivityWallLibraryEntry>({
    noun: LIBRARY_ITEM_NOUNS.activityWall,
    titleOf: (entry) => entry.title || 'Untitled',
    detail: () => 'Its posts are deleted with it.',
    remove: async (entry) => {
      if (!uid) throw new Error('Not signed in.');
      await onDelete(entry.id);
      await deleteDoc(
        doc(db, 'activity_wall_sessions', activityWallSessionId(uid, entry.id))
      ).catch(() => {
        // Rules deny deleting the session doc; clearing posts + entry retires a wall.
      });
    },
    addToast,
    onError: (err) =>
      console.error('[ActivityWall] Failed to delete wall:', err),
  });

  return { counts, clearPosts, wallDelete };
};
