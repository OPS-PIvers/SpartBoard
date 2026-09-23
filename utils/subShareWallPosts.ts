/**
 * Reads an Activity Wall's approved posts off the teacher's own session, for
 * the per-share names file (plan §3.4).
 *
 * A post is a student's own words, name and uid, so it travels in the names
 * file rather than in the share's broadly readable `content/`. Uploads live in
 * Storage under a path only the teacher and the uploader can read, so each is
 * resolved to a download URL here, on the teacher's client, the way the
 * notebook bundle resolves its page images.
 */

import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import { activityWallSessionId } from '@/utils/activityWallLinks';
import {
  normalizeActivityWallSubmission,
  normalizeActivityWallLibraryEntry,
} from '@/utils/activityWallNormalize';
import {
  isArchived,
  isSafeHttpUrl,
} from '@/components/activityWall/render/useMediaUrl';
import { logError } from '@/utils/logError';
import type { ActivityWallLibraryEntry, ActivityWallSubmission } from '@/types';

const STORAGE_BACKED_TYPES = new Set(['photo', 'video', 'file']);

/** The path the card would resolve, when it is a Storage object. */
function storagePathOf(post: ActivityWallSubmission): string | null {
  if (isArchived(post)) return null;
  if (!STORAGE_BACKED_TYPES.has(post.type ?? 'text')) return null;
  const path = post.storagePath ?? post.content;
  if (!path || isSafeHttpUrl(path)) return null;
  return path;
}

/**
 * Swaps a Storage path for a download URL, so the substitute's client renders
 * the upload without reading an object the rules keep to the teacher and the
 * student who posted it. A path that will not resolve is left alone: the card
 * already says the media is unavailable.
 */
async function withMediaUrl(
  post: ActivityWallSubmission
): Promise<ActivityWallSubmission> {
  const path = storagePathOf(post);
  if (!path) return post;
  try {
    const url = await getDownloadURL(storageRef(storage, path));
    return { ...post, storagePath: url };
  } catch (err) {
    logError('subShareWallPosts.media', err, { submissionId: post.id });
    return post;
  }
}

/** Reads one wall's approved posts, keyed by the activity the widget has open. */
export function wallPostsReader(
  hostUid: string | undefined
): ((activityId: string) => Promise<unknown>) | undefined {
  if (!hostUid) return undefined;
  return async (activityId) => {
    const entrySnap = await getDoc(
      doc(db, 'users', hostUid, 'activity_wall_activities', activityId)
    );
    if (!entrySnap.exists()) throw new Error('activity wall not found');
    const entry = normalizeActivityWallLibraryEntry(
      entrySnap.id,
      entrySnap.data() as Partial<ActivityWallLibraryEntry>
    );
    const sessionId = activityWallSessionId(hostUid, activityId);
    const snap = await getDocs(
      collection(db, 'activity_wall_sessions', sessionId, 'submissions')
    );
    const approved = snap.docs
      .map((docSnap) =>
        normalizeActivityWallSubmission(
          docSnap.id,
          docSnap.data() as Partial<ActivityWallSubmission>,
          entry.mode === 'photo'
        )
      )
      .filter((post) => post.status === 'approved');
    return Promise.all(approved.map(withMediaUrl));
  };
}
