// Live session state + teacher actions for the active Activity Wall.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  ActivityWallLibraryEntry,
  ActivityWallSession,
  ActivityWallSubmission,
} from '@/types';
import {
  mirrorSessionFromEntry,
  normalizeActivityWallSubmission,
} from '@/utils/activityWallNormalize';
import type { WallMovePatch } from '@/components/activityWall/render';
import { activityWallSessionId } from '@/utils/activityWallLinks';

/** Firestore caps a batch at 500 writes; stay under it with room to spare. */
const CLEAR_CHUNK_SIZE = 400;

/** Writes the full session mirror so rules see a complete Padlet-lite doc. */
export const writeSessionMirror = async (
  uid: string,
  entry: ActivityWallLibraryEntry,
  overrides: Partial<ActivityWallSession> = {}
): Promise<void> => {
  const sessionId = activityWallSessionId(uid, entry.id);
  const payload: Record<string, unknown> = {
    ...mirrorSessionFromEntry(entry, uid),
    ...overrides,
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, 'activity_wall_sessions', sessionId), payload, {
    merge: true,
  });
};

export interface DriveSyncCounts {
  failed: number;
  lost: number;
  needsConsent: number;
}

export interface UseActivityWallSessionResult {
  sessionId: string | null;
  session: ActivityWallSession | null;
  submissions: ActivityWallSubmission[];
  pendingCount: number;
  driveSync: DriveSyncCounts;
  /** Short-link code of the active wall's most recent gallery share, live from Firestore. */
  latestShareCode: string | undefined;
  /** Share id of the active wall's most recent gallery share, for the long-URL fallback. */
  latestShareId: string | undefined;
  approve: (submissionId: string) => Promise<void>;
  reject: (submissionId: string) => Promise<void>;
  deletePost: (submissionId: string) => Promise<void>;
  movePost: (submissionId: string, patch: WallMovePatch) => Promise<void>;
  pinPost: (submissionId: string, pinned: boolean) => Promise<void>;
  editPost: (
    submissionId: string,
    changes: { content?: string; title?: string }
  ) => Promise<void>;
  clearPosts: (targetSessionId?: string) => Promise<void>;
  setAcceptingResponses: (accepting: boolean) => Promise<void>;
}

const submissionsCollection = (sessionId: string) =>
  collection(db, 'activity_wall_sessions', sessionId, 'submissions');

const submissionDoc = (sessionId: string, submissionId: string) =>
  doc(db, 'activity_wall_sessions', sessionId, 'submissions', submissionId);

/** Deletes every submission under a session in batched chunks. */
export const clearWallSubmissions = async (
  sessionId: string
): Promise<void> => {
  const snap = await getDocs(submissionsCollection(sessionId));
  for (let i = 0; i < snap.docs.length; i += CLEAR_CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const docSnap of snap.docs.slice(i, i + CLEAR_CHUNK_SIZE)) {
      batch.delete(docSnap.ref);
    }
    await batch.commit();
  }
};

export const useActivityWallSession = (
  uid: string | undefined,
  entry: ActivityWallLibraryEntry | null,
  saveActivity: (entry: ActivityWallLibraryEntry) => Promise<void>
): UseActivityWallSessionResult => {
  const sessionId = uid && entry ? activityWallSessionId(uid, entry.id) : null;

  const session = useMemo<ActivityWallSession | null>(
    () => (uid && entry ? mirrorSessionFromEntry(entry, uid) : null),
    [entry, uid]
  );

  const [state, setState] = useState<{
    sessionId: string | null;
    submissions: ActivityWallSubmission[];
  }>({ sessionId: null, submissions: [] });

  // `updatedAt` is zeroed in the key so the mirror write doesn't re-fire forever.
  const mirrorKey = session
    ? JSON.stringify({ ...session, updatedAt: 0 })
    : null;
  useEffect(() => {
    if (!sessionId || !mirrorKey) return;
    const payload = {
      ...(JSON.parse(mirrorKey) as Record<string, unknown>),
      updatedAt: Date.now(),
    };
    void setDoc(doc(db, 'activity_wall_sessions', sessionId), payload, {
      merge: true,
    }).catch((err) => {
      console.error('[ActivityWall] Failed to mirror session doc:', err);
    });
  }, [sessionId, mirrorKey]);

  const [shareInfo, setShareInfo] = useState<{
    sessionId: string | null;
    latestShareCode: string | undefined;
    latestShareId: string | undefined;
  }>({ sessionId: null, latestShareCode: undefined, latestShareId: undefined });

  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(
      doc(db, 'activity_wall_sessions', sessionId),
      (snap) => {
        const data = snap.data() as ActivityWallSession | undefined;
        setShareInfo({
          sessionId,
          latestShareCode: data?.latestShareCode,
          latestShareId: data?.latestShareId,
        });
      },
      (err) => {
        console.error('[ActivityWall] Session share listener failed:', err);
      }
    );
    return unsubscribe;
  }, [sessionId]);

  const latestShareCode =
    shareInfo.sessionId === sessionId ? shareInfo.latestShareCode : undefined;
  const latestShareId =
    shareInfo.sessionId === sessionId ? shareInfo.latestShareId : undefined;

  const isPhotoWall = entry?.mode === 'photo';
  useEffect(() => {
    // No reset needed: `submissions` below discards state from a stale sessionId.
    if (!sessionId) return;
    const unsubscribe = onSnapshot(
      submissionsCollection(sessionId),
      (snap) => {
        setState({
          sessionId,
          submissions: snap.docs.map((docSnap) =>
            normalizeActivityWallSubmission(
              docSnap.id,
              docSnap.data() as Partial<ActivityWallSubmission>,
              isPhotoWall
            )
          ),
        });
      },
      (err) => {
        console.error('[ActivityWall] Submissions listener failed:', err);
      }
    );
    return unsubscribe;
  }, [sessionId, isPhotoWall]);

  const submissions = useMemo(
    () => (state.sessionId === sessionId ? state.submissions : []),
    [sessionId, state]
  );

  const pendingCount = useMemo(
    () => submissions.filter((s) => s.status === 'pending').length,
    [submissions]
  );

  const driveSync = useMemo<DriveSyncCounts>(() => {
    let failed = 0;
    let lost = 0;
    let needsConsent = 0;
    for (const submission of submissions) {
      if (submission.archiveStatus === 'failed') failed += 1;
      if (submission.archiveStatus === 'lost') lost += 1;
      if (submission.archiveError === 'needs-consent') needsConsent += 1;
    }
    return { failed, lost, needsConsent };
  }, [submissions]);

  const writeSubmission = useCallback(
    async (submissionId: string, patch: Record<string, unknown>) => {
      if (!sessionId) return;
      await updateDoc(submissionDoc(sessionId, submissionId), patch);
    },
    [sessionId]
  );

  const approve = useCallback(
    (submissionId: string) =>
      writeSubmission(submissionId, { status: 'approved' }),
    [writeSubmission]
  );

  const reject = useCallback(
    async (submissionId: string) => {
      if (!sessionId) return;
      await deleteDoc(submissionDoc(sessionId, submissionId));
    },
    [sessionId]
  );

  const deletePost = reject;

  const movePost = useCallback(
    (submissionId: string, patch: WallMovePatch) => {
      const write: Record<string, unknown> = {};
      if ('sectionId' in patch) {
        write.sectionId =
          patch.sectionId === null ? deleteField() : patch.sectionId;
      }
      if ('cellKey' in patch) {
        write.cellKey = patch.cellKey === null ? deleteField() : patch.cellKey;
      }
      if (typeof patch.order === 'number') write.order = patch.order;
      if (Object.keys(write).length === 0) return Promise.resolve();
      return writeSubmission(submissionId, write);
    },
    [writeSubmission]
  );

  const pinPost = useCallback(
    (submissionId: string, pinned: boolean) =>
      writeSubmission(submissionId, { pinned }),
    [writeSubmission]
  );

  const editPost = useCallback(
    (submissionId: string, changes: { content?: string; title?: string }) => {
      const write: Record<string, unknown> = { editedAt: Date.now() };
      if (typeof changes.content === 'string') write.content = changes.content;
      if (typeof changes.title === 'string') write.title = changes.title;
      return writeSubmission(submissionId, write);
    },
    [writeSubmission]
  );

  const clearPosts = useCallback(
    async (targetSessionId?: string) => {
      const target = targetSessionId ?? sessionId;
      if (!target) return;
      await clearWallSubmissions(target);
    },
    [sessionId]
  );

  const setAcceptingResponses = useCallback(
    async (accepting: boolean) => {
      if (!entry || !uid) return;
      const next = {
        ...entry,
        acceptingResponses: accepting,
        updatedAt: Date.now(),
      };
      await saveActivity(next);
      await writeSessionMirror(uid, next);
    },
    [entry, saveActivity, uid]
  );

  return {
    sessionId,
    session,
    submissions,
    pendingCount,
    driveSync,
    latestShareCode,
    latestShareId,
    approve,
    reject,
    deletePost,
    movePost,
    pinPost,
    editPost,
    clearPosts,
    setAcceptingResponses,
  };
};
