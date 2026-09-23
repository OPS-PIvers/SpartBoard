import { useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { subShareContentId } from '@/utils/subShareContent';
import type { SubShareContentValue } from '@/context/SubShareContentContextValue';
import type {
  SubShareContentDoc,
  SubShareContentKind,
  SubstituteShareRoster,
} from '@/types';

const NO_ROSTERS: SubstituteShareRoster[] = [];

/** A read a share's rules refused, which for a key means "not your share". */
function isPermissionDenied(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'permission-denied'
  );
}

/**
 * Reads a share's bundled content, once per item per accepted version.
 *
 * A teacher's push rewrites these docs and bumps the share's contentVersion,
 * which the sub accepts from the reload banner without the portal ever
 * unmounting — so the cache has to be keyed by that version, not the share
 * alone, or an already-loaded Drawing would keep showing pre-push strokes. A
 * failed read caches as "nothing bundled": the widget then renders empty
 * rather than falling back to the sub's own library, which is the whole point
 * of bundling.
 */
export function useSubShareContentLoader(
  shareId: string | null,
  version: number,
  boardId: string | null = null,
  rosters: SubstituteShareRoster[] = NO_ROSTERS
): SubShareContentValue | null {
  // The caches are keyed by share and version only. Walking to the next board
  // and back must not re-read what this share already gave us, so `boardId`
  // and `rosters` are folded in afterwards rather than becoming cache keys.
  const readers = useMemo(() => {
    if (!shareId) return null;
    // Lives in the memo, so a different share or version starts empty.
    const cache = new Map<string, Promise<unknown>>();
    const keyCache = new Map<
      string,
      Promise<{ payload: unknown; denied: boolean }>
    >();
    return {
      load: (kind: SubShareContentKind, itemId: string) => {
        const id = subShareContentId(kind, itemId);
        const hit = cache.get(id);
        if (hit) return hit;
        const read = getDoc(
          doc(db, 'shared_collections', shareId, 'content', id)
        )
          .then((snap) =>
            snap.exists()
              ? ((snap.data() as SubShareContentDoc).payload ?? null)
              : null
          )
          .catch((err: unknown) => {
            logError('useSubShareContentLoader.load', err, { shareId, id });
            return null;
          });
        cache.set(id, read);
        return read;
      },
      loadKey: (kind: SubShareContentKind, itemId: string) => {
        const id = subShareContentId(kind, itemId);
        const hit = keyCache.get(id);
        if (hit) return hit;
        const read = getDoc(doc(db, 'shared_collections', shareId, 'keys', id))
          .then((snap) => ({
            payload: snap.exists()
              ? ((snap.data() as SubShareContentDoc).payload ?? null)
              : null,
            denied: false,
          }))
          .catch((err: unknown) => {
            // A refusal is an expected outcome here: any district viewer with
            // the link who the share does not name hits it on every key.
            const denied = isPermissionDenied(err);
            if (!denied) {
              logError('useSubShareContentLoader.loadKey', err, {
                shareId,
                id,
              });
            }
            return { payload: null, denied };
          });
        keyCache.set(id, read);
        return read;
      },
    };
    // `version` is what empties the caches on a teacher's push; the readers
    // themselves never look at it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, version]);

  return useMemo(
    () =>
      readers && shareId
        ? { shareId, version, boardId, rosters, ...readers }
        : null,
    [readers, shareId, version, boardId, rosters]
  );
}
