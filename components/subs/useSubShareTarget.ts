/**
 * Resolving a `/subs/s/{shareId}[/{boardId}]` link into a view.
 *
 * A link carries no building, and the `/subs` screens need one, so this reads
 * the share and takes the building from the doc itself. That is not a
 * weakening: the read rules never gated a substitute share on building — any
 * verified district account can already fetch any unexpired one by id — and
 * the teacher sending the link is the signal that this sub should have it. The
 * directory path keeps its own building check, which still guards against
 * navigating sideways out of the building the sub picked.
 *
 * Expiry is enforced here, as it is on every other read path.
 */

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type { SharedCollection } from '@/types';
import type { SubsDeepLink } from './subsDeepLink';

export type SubShareTarget =
  | { status: 'loading' }
  | {
      status: 'collection-board';
      shareId: string;
      boardId: string;
      buildingId: string;
    }
  | { status: 'board'; shareId: string; buildingId: string }
  | { status: 'error'; message: string };

const NOT_FOUND =
  'That link does not point to a share we can find. It may have been ended.';
const EXPIRED = 'This share has expired.';

/** The board the sub lands on: the teacher's pick, else first in walk order. */
function landingBoardId(share: SharedCollection): string | null {
  const ids = Array.isArray(share.boardIds) ? share.boardIds : [];
  if (share.defaultBoardId && ids.includes(share.defaultBoardId)) {
    return share.defaultBoardId;
  }
  return ids[0] ?? null;
}

function resolveCollection(
  share: SharedCollection,
  shareId: string,
  boardId: string | undefined
): ResolvedTarget {
  if (!share.expiresAt || share.expiresAt <= Date.now()) {
    return { status: 'error', message: EXPIRED };
  }
  if (!share.buildingId) {
    return { status: 'error', message: NOT_FOUND };
  }
  if (boardId && !(share.boardIds ?? []).includes(boardId)) {
    return {
      status: 'error',
      message: 'That board is not part of this share any more.',
    };
  }
  const landing = boardId ?? landingBoardId(share);
  if (!landing) {
    return {
      status: 'error',
      message: 'This share has no boards left in it.',
    };
  }
  return {
    status: 'collection-board',
    shareId,
    boardId: landing,
    buildingId: share.buildingId,
  };
}

/** Everything but `loading`, which is derived from the key instead. */
type ResolvedTarget = Exclude<SubShareTarget, { status: 'loading' }>;

interface TargetSnapshot {
  key: string;
  target: ResolvedTarget;
}

export function useSubShareTarget(link: SubsDeepLink | null): SubShareTarget {
  const [snapshot, setSnapshot] = useState<TargetSnapshot | null>(null);
  const shareId = link?.shareId ?? null;
  const boardId = link?.boardId;
  const key = shareId ? `${shareId}::${boardId ?? ''}` : '';

  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;
    const requestKey = `${shareId}::${boardId ?? ''}`;
    const setTarget = (target: ResolvedTarget) =>
      setSnapshot({ key: requestKey, target });

    void (async () => {
      try {
        const collSnap = await getDoc(doc(db, 'shared_collections', shareId));
        if (cancelled) return;
        if (collSnap.exists()) {
          const share = collSnap.data() as SharedCollection;
          if (share.intendedMode !== 'substitute') {
            setTarget({
              status: 'error',
              message: 'That link is not a sub share.',
            });
            return;
          }
          setTarget(resolveCollection(share, shareId, boardId));
          return;
        }

        // Substitute shares made before collections were a thing live in
        // /shared_boards, and their links are still in teachers' outboxes.
        const boardSnap = await getDoc(doc(db, 'shared_boards', shareId));
        if (cancelled) return;
        const legacy = boardSnap.exists()
          ? (boardSnap.data() as {
              intendedMode?: string;
              expiresAt?: number;
              buildingId?: string;
            })
          : null;
        if (!legacy || legacy.intendedMode !== 'substitute') {
          setTarget({ status: 'error', message: NOT_FOUND });
          return;
        }
        if (!legacy.expiresAt || legacy.expiresAt <= Date.now()) {
          setTarget({ status: 'error', message: EXPIRED });
          return;
        }
        if (!legacy.buildingId) {
          setTarget({ status: 'error', message: NOT_FOUND });
          return;
        }
        setTarget({
          status: 'board',
          shareId,
          buildingId: legacy.buildingId,
        });
      } catch (err) {
        if (cancelled) return;
        logError('useSubShareTarget', err, { shareId });
        // A denied read is what an ended share looks like from here, so say
        // that rather than something the sub cannot act on.
        setTarget({ status: 'error', message: NOT_FOUND });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareId, boardId]);

  if (!snapshot || snapshot.key !== key) return { status: 'loading' };
  return snapshot.target;
}
