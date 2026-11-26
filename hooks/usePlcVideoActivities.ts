import { useCallback, useMemo } from 'react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcVideoActivityEntry } from '@/types';
import { logError } from '@/utils/logError';
import {
  isLivePlcLibraryEntry,
  usePlcLibraryEntries,
  type PlcLibrarySpec,
} from '@/hooks/usePlcLibraryEntries';

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

const VIDEO_ACTIVITY_LIBRARY: PlcLibrarySpec<
  PlcVideoActivityEntry,
  ShareVideoActivityWithPlcInput
> = {
  kind: 'videoActivity',
  subcollection: VIDEO_ACTIVITIES_SUBCOLLECTION,
  parse: parsePlcVideoActivityEntry,
  keep: isLivePlcLibraryEntry,
  orderByUpdatedAt: true,
  fromProvider: (s) => s.videoActivities,
  share: writePlcVideoActivityEntry,
};

/** Live PLC video activity library, newest edit first; `null` plcId disables it. */
export const usePlcVideoActivities = (
  plcId: string | null
): UsePlcVideoActivitiesResult => {
  const { user } = useAuth();
  const { entries, loading, error, share, unshare, restore } =
    usePlcLibraryEntries(plcId, VIDEO_ACTIVITY_LIBRARY);

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

  return useMemo(
    () => ({
      videoActivities: entries,
      loading,
      error,
      shareVideoActivityWithPlc: share,
      mirrorPlcVideoActivityHeader,
      unshareVideoActivityFromPlc: unshare,
      restoreVideoActivityInPlc: restore,
    }),
    [
      entries,
      loading,
      error,
      share,
      mirrorPlcVideoActivityHeader,
      unshare,
      restore,
    ]
  );
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
