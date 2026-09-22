import { useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { subShareContentId } from '@/utils/subShareContent';
import type { SubShareContentValue } from '@/context/SubShareContentContextValue';
import type { SubShareContentDoc, SubShareContentKind } from '@/types';

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
  version: number
): SubShareContentValue | null {
  return useMemo(() => {
    if (!shareId) return null;
    // Lives in the memo, so a different share or version starts empty.
    const cache = new Map<string, Promise<unknown>>();
    return {
      shareId,
      version,
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
    };
  }, [shareId, version]);
}
