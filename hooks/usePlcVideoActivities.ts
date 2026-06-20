import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcVideoActivityEntry } from '@/types';
import { logError } from '@/utils/logError';
import { usePlcSubcollection } from '@/context/usePlcContext';

const PLCS_COLLECTION = 'plcs';
const VIDEO_ACTIVITIES_SUBCOLLECTION = 'video_activities';

interface ShareVideoActivityWithPlcInput {
  /** Firestore doc id for the new PLC video activity entry. Caller mints (uuid). */
  plcVideoActivityId: string;
  /** Pointer to the canonical `/synced_video_activities/{groupId}` doc. */
  syncGroupId: string;
  /** Mirrored from the synced group at share time. */
  title: string;
  /** Mirrored from the source activity; may be `''` if absent. */
  youtubeUrl: string;
  /** Mirrored from the synced group's questions array length. */
  questionCount: number;
  /** Display name snapshot for attribution. */
  sharedByName: string;
  /** Lowercased email snapshot for display. */
  sharedByEmail: string;
}

interface UsePlcVideoActivitiesResult {
  videoActivities: PlcVideoActivityEntry[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty
   * `videoActivities` array is "couldn't load," not "no items yet."
   */
  error: Error | null;
  /**
   * Write a new PLC video activity entry. Caller is responsible for first
   * standing up the canonical `synced_video_activities/{syncGroupId}` doc
   * (via `createSyncedVideoActivityGroup`). Doc id = `plcVideoActivityId`.
   * The signed-in user is stamped as `sharedBy`.
   */
  shareVideoActivityWithPlc: (
    input: ShareVideoActivityWithPlcInput
  ) => Promise<void>;
  /**
   * Mirror title/questionCount/youtubeUrl onto the PLC entry after a peer's
   * publish. Fire-and-forget — failures log but don't reject so the
   * caller's primary action (e.g. `publishSyncedVideoActivity`) returns
   * cleanly. `not-found` here is benign: a teammate unshared between our
   * snapshot read and this mirror write; the canonical group already has
   * the fresh content.
   */
  mirrorPlcVideoActivityHeader: (
    plcVideoActivityId: string,
    patch: {
      title?: string;
      questionCount?: number;
      youtubeUrl?: string;
    }
  ) => Promise<void>;
  /**
   * Unshare (soft-delete, Decision 3.1) a PLC video activity entry. Any member
   * can unshare (PLC-owned model). Writes a `deletedAt` tombstone so the entry
   * drops out of the live library but stays restorable from Trash; the
   * canonical synced group is untouched. Restore with
   * `restoreVideoActivityInPlc`.
   */
  unshareVideoActivityFromPlc: (plcVideoActivityId: string) => Promise<void>;
  /** Restore a soft-deleted PLC video activity entry by clearing `deletedAt`. */
  restoreVideoActivityInPlc: (plcVideoActivityId: string) => Promise<void>;
}

export function parsePlcVideoActivityEntry(
  id: string,
  data: Record<string, unknown>
): PlcVideoActivityEntry | null {
  if (
    typeof data.title !== 'string' ||
    typeof data.questionCount !== 'number' ||
    typeof data.syncGroupId !== 'string' ||
    typeof data.sharedBy !== 'string' ||
    typeof data.sharedAt !== 'number' ||
    typeof data.updatedAt !== 'number'
  ) {
    return null;
  }
  const entry: PlcVideoActivityEntry = {
    id,
    title: data.title,
    // `youtubeUrl` was added with the type. Pre-rollout entries (if any
    // existed during dev) lack the field — default to `''` rather than
    // dropping the row. Production never wrote without the field so this
    // branch should never trigger; kept defensively.
    youtubeUrl: typeof data.youtubeUrl === 'string' ? data.youtubeUrl : '',
    questionCount: data.questionCount,
    syncGroupId: data.syncGroupId,
    sharedBy: data.sharedBy,
    sharedByEmail:
      typeof data.sharedByEmail === 'string' ? data.sharedByEmail : '',
    sharedByName:
      typeof data.sharedByName === 'string' ? data.sharedByName : '',
    sharedAt: data.sharedAt,
    updatedAt: data.updatedAt,
  };
  // Soft-delete tombstone (Decision 3.1): optional so legacy entries parse
  // cleanly; written as a plain int (Date.now()) like the other time fields.
  if (typeof data.deletedAt === 'number') {
    entry.deletedAt = data.deletedAt;
  } else if (data.deletedAt === null) {
    entry.deletedAt = null;
  }
  return entry;
}

/**
 * Live subscription to a single PLC's video activity library (Phase 4).
 * Returns entries sorted newest-edit-first by `updatedAt`. Pass `null`
 * for `plcId` to disable the listener (e.g. while the dashboard is closed).
 *
 * Mirrors `usePlcQuizzes.ts` exactly — same parser-drops-malformed
 * defense, same render-time `prevPlcId` reset so the UI never flashes
 * the previous PLC's entries while the new snapshot is in flight.
 */
export const usePlcVideoActivities = (
  plcId: string | null
): UsePlcVideoActivitiesResult => {
  const { user } = useAuth();
  // Back-compat (Decision 1.4): read from a mounted PlcProvider when present.
  const fromProvider = usePlcSubcollection(plcId, (s) => s.videoActivities);
  const [videoActivities, setVideoActivities] = useState<
    PlcVideoActivityEntry[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setVideoActivities([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (fromProvider) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setVideoActivities([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(
      db,
      PLCS_COLLECTION,
      plcId,
      VIDEO_ACTIVITIES_SUBCOLLECTION
    );
    const unsub = onSnapshot(
      query(ref, orderBy('updatedAt', 'desc')),
      (snap) => {
        const list: PlcVideoActivityEntry[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcVideoActivityEntry(
            d.id,
            d.data() as Record<string, unknown>
          );
          // Soft-deleted (unshared) entries drop out of the live library — they
          // live in Trash until restored or GC'd (Decision 3.1).
          if (parsed && parsed.deletedAt == null) list.push(parsed);
        });
        setVideoActivities(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcVideoActivities.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, fromProvider]);

  const shareVideoActivityWithPlc = useCallback(
    async (input: ShareVideoActivityWithPlcInput): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const now = Date.now();
      const entry: PlcVideoActivityEntry = {
        id: input.plcVideoActivityId,
        title: input.title,
        youtubeUrl: input.youtubeUrl,
        questionCount: input.questionCount,
        syncGroupId: input.syncGroupId,
        sharedBy: user.uid,
        sharedByEmail: input.sharedByEmail,
        sharedByName: input.sharedByName,
        sharedAt: now,
        updatedAt: now,
      };
      await setDoc(
        doc(
          db,
          PLCS_COLLECTION,
          plcId,
          VIDEO_ACTIVITIES_SUBCOLLECTION,
          input.plcVideoActivityId
        ),
        entry
      );
    },
    [plcId, user]
  );

  const mirrorPlcVideoActivityHeader = useCallback(
    async (
      plcVideoActivityId: string,
      patch: { title?: string; questionCount?: number; youtubeUrl?: string }
    ): Promise<void> => {
      if (!plcId || !user) return;
      try {
        const fields: Record<string, unknown> = { updatedAt: Date.now() };
        if (patch.title !== undefined) fields.title = patch.title;
        if (patch.questionCount !== undefined) {
          fields.questionCount = patch.questionCount;
        }
        if (patch.youtubeUrl !== undefined)
          fields.youtubeUrl = patch.youtubeUrl;
        await updateDoc(
          doc(
            db,
            PLCS_COLLECTION,
            plcId,
            VIDEO_ACTIVITIES_SUBCOLLECTION,
            plcVideoActivityId
          ),
          fields
        );
      } catch (err) {
        logError('usePlcVideoActivities.mirrorHeader', err, {
          plcId,
          plcVideoActivityId,
        });
      }
    },
    [plcId, user]
  );

  // Soft-delete (Decision 3.1): write a `deletedAt` tombstone (+ bump
  // updatedAt) instead of hard-deleting. Identity + attribution fields stay
  // untouched; the post-merge doc passes the widened `keys().hasOnly([...])`.
  const unshareVideoActivityFromPlc = useCallback(
    async (plcVideoActivityId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await updateDoc(
        doc(
          db,
          PLCS_COLLECTION,
          plcId,
          VIDEO_ACTIVITIES_SUBCOLLECTION,
          plcVideoActivityId
        ),
        { deletedAt: Date.now(), updatedAt: Date.now() }
      );
    },
    [plcId, user]
  );

  const restoreVideoActivityInPlc = useCallback(
    async (plcVideoActivityId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await updateDoc(
        doc(
          db,
          PLCS_COLLECTION,
          plcId,
          VIDEO_ACTIVITIES_SUBCOLLECTION,
          plcVideoActivityId
        ),
        { deletedAt: null, updatedAt: Date.now() }
      );
    },
    [plcId, user]
  );

  return useMemo(() => {
    const resolved = fromProvider
      ? {
          videoActivities: fromProvider.data,
          loading: fromProvider.loading,
          error: fromProvider.error,
        }
      : { videoActivities, loading, error };
    return {
      ...resolved,
      shareVideoActivityWithPlc,
      mirrorPlcVideoActivityHeader,
      unshareVideoActivityFromPlc,
      restoreVideoActivityInPlc,
    };
  }, [
    fromProvider,
    videoActivities,
    loading,
    error,
    shareVideoActivityWithPlc,
    mirrorPlcVideoActivityHeader,
    unshareVideoActivityFromPlc,
    restoreVideoActivityInPlc,
  ]);
};

/**
 * One-shot write of a PLC video activity entry. Used from the
 * VideoActivityWidget's "Share with PLC" handler — the widget knows the
 * target PLC at call time but isn't subscribed to that PLC's
 * `usePlcVideoActivities`. Mirrors `writePlcQuizEntry` from Phase 2.
 * Rejects on failure (unlike fire-and-forget side effects this is a
 * primary user action).
 */
export async function writePlcVideoActivityEntry(
  plcId: string,
  uid: string,
  input: ShareVideoActivityWithPlcInput
): Promise<void> {
  const now = Date.now();
  const entry: PlcVideoActivityEntry = {
    id: input.plcVideoActivityId,
    title: input.title,
    youtubeUrl: input.youtubeUrl,
    questionCount: input.questionCount,
    syncGroupId: input.syncGroupId,
    sharedBy: uid,
    sharedByEmail: input.sharedByEmail,
    sharedByName: input.sharedByName,
    sharedAt: now,
    updatedAt: now,
  };
  await setDoc(
    doc(
      db,
      PLCS_COLLECTION,
      plcId,
      VIDEO_ACTIVITIES_SUBCOLLECTION,
      input.plcVideoActivityId
    ),
    entry
  );
}
