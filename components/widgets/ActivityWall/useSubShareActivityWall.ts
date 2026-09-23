import { useMemo } from 'react';
import { useInSubShare, useShareContent } from '@/hooks/useShareContent';
import type {
  ActivityWallSession,
  SubShareActivityWallPayload,
  SubShareActivityWallView,
} from '@/types';
import { mirrorSessionFromEntry } from '@/utils/activityWallNormalize';

export interface SubShareActivityWall {
  /** False everywhere but `/subs`, where the caller must use this instead. */
  active: boolean;
  entry: SubShareActivityWallView | null;
  /** Derived from the entry, the way the teacher's own mirror is. */
  session: ActivityWallSession | null;
  loading: boolean;
}

/**
 * The teacher's Activity Wall inside a sub share.
 *
 * The definition lives in the teacher's `users/` tree and the session doc is
 * keyed on their uid, so a substitute can read neither. The definition is
 * bundled at share time and the session derived from it locally. The posts are
 * not bundled: a submission carries a student's own words, name and uid.
 */
export function useSubShareActivityWall(
  activityId: string | null | undefined
): SubShareActivityWall {
  const inShare = useInSubShare();
  const bundled = useShareContent<SubShareActivityWallPayload>(
    'activityWall',
    activityId
  );
  const payload = bundled.payload;
  const session = useMemo(
    () =>
      payload ? mirrorSessionFromEntry(payload.entry, payload.hostUid) : null,
    [payload]
  );
  return {
    active: inShare,
    entry: payload?.entry ?? null,
    session,
    loading: bundled.status === 'loading',
  };
}
