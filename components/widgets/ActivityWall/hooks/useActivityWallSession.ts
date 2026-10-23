// Live session state + teacher actions for the active Activity Wall.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
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
  SharedActivityWall,
} from '@/types';
import {
  mirrorSessionFromEntry,
  normalizeActivityWallSubmission,
} from '@/utils/activityWallNormalize';
import type { WallMovePatch } from '@/components/activityWall/render';
import { activityWallSessionId } from '@/utils/activityWallLinks';
import { isSandboxed } from '@/utils/tourSandbox';

/** Firestore caps a batch at 500 writes; stay under it with room to spare. */
const CLEAR_CHUNK_SIZE = 400;

/** Writes the full session mirror so rules see a complete Padlet-lite doc. */
export const writeSessionMirror = async (
  uid: string,
  entry: ActivityWallLibraryEntry,
  overrides: Partial<ActivityWallSession> = {}
): Promise<void> => {
  if (isSandboxed(entry.id)) return;
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

/** Which board shares may read a wall's posts; kept out of the session doc, which students read. */
export const wallBoardAccessDoc = (sessionId: string) =>
  doc(db, 'activity_wall_sessions', sessionId, 'boardAccess', 'boards');

/** The list with `boardShareEntry` ("shareId/hostUid") added (max 3, evicting only deleted shares), or null to leave it. */
export const nextWallBoardShareIds = async (
  known: string[],
  boardShareEntry: string
): Promise<string[] | null> => {
  if (known.includes(boardShareEntry)) return null;
  // Entries without a host pin, or for this share under another host, grant nothing, so they never hold a slot.
  const shareId = boardShareEntry.split('/')[0];
  let kept = known.filter(
    (id) => id.includes('/') && id.split('/')[0] !== shareId
  );
  if (kept.length >= 3) {
    const pinned = kept;
    const alive = await Promise.all(
      pinned.map((id) =>
        getDoc(doc(db, 'shared_boards', id.split('/')[0]))
          .then((snap) => snap.exists())
          .catch(() => true)
      )
    );
    kept = pinned.filter((_, index) => alive[index]);
    if (kept.length >= 3) return null;
  }
  return [boardShareEntry, ...kept];
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
  setStudentsCanSeePosts: (visible: boolean) => Promise<void>;
  setTimelineDatesHidden: (hidden: boolean) => Promise<void>;
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

export type WallPostActions = Pick<
  UseActivityWallSessionResult,
  'approve' | 'reject' | 'deletePost' | 'movePost' | 'pinPost' | 'editPost'
>;

/** Moderation writes on one session's posts, for its owner or a board co-teacher. */
export const useWallPostActions = (
  sessionId: string | null
): WallPostActions => {
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

  return useMemo(
    () => ({ approve, reject, deletePost, movePost, pinPost, editPost }),
    [approve, reject, deletePost, movePost, pinPost, editPost]
  );
};

export const useActivityWallSession = (
  uid: string | undefined,
  entry: ActivityWallLibraryEntry | null,
  saveActivity: (entry: ActivityWallLibraryEntry) => Promise<void>,
  timelineDates?: boolean,
  /** "shareId/hostUid" of a live board share whose members may read this wall. */
  boardShareEntry?: string | null
): UseActivityWallSessionResult => {
  const sessionId = uid && entry ? activityWallSessionId(uid, entry.id) : null;

  const session = useMemo<ActivityWallSession | null>(
    () =>
      uid && entry
        ? mirrorSessionFromEntry(entry, uid, { timelineDates })
        : null,
    [entry, uid, timelineDates]
  );

  const [state, setState] = useState<{
    sessionId: string | null;
    submissions: ActivityWallSubmission[];
  }>({ sessionId: null, submissions: [] });

  // `updatedAt` is zeroed in the key so the mirror write doesn't re-fire forever.
  const mirrorKey = session
    ? JSON.stringify({ ...session, updatedAt: 0 })
    : null;
  // A tour's sandbox wall has no session doc.
  const sandboxed = !!entry && isSandboxed(entry.id);
  useEffect(() => {
    if (!sessionId || !mirrorKey || sandboxed) return;
    const payload = {
      ...(JSON.parse(mirrorKey) as Record<string, unknown>),
      updatedAt: Date.now(),
    };
    void setDoc(doc(db, 'activity_wall_sessions', sessionId), payload, {
      merge: true,
    }).catch((err) => {
      console.error('[ActivityWall] Failed to mirror session doc:', err);
    });
  }, [sessionId, mirrorKey, sandboxed]);

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

  const accessSessionId = boardShareEntry && !sandboxed ? sessionId : null;
  const [boardAccess, setBoardAccess] = useState<{
    sessionId: string;
    ids: string[];
  } | null>(null);
  useEffect(() => {
    if (!accessSessionId) return undefined;
    return onSnapshot(
      wallBoardAccessDoc(accessSessionId),
      (snap) => {
        const ids: unknown = snap.data()?.boardShareIds;
        setBoardAccess({
          sessionId: accessSessionId,
          ids: Array.isArray(ids)
            ? ids.filter((id): id is string => typeof id === 'string')
            : [],
        });
      },
      (err) => {
        console.error('[ActivityWall] Board access listener failed:', err);
      }
    );
  }, [accessSessionId]);

  // An id already listed is never rewritten, and live shares are never evicted, so open boards can't fight.
  const knownBoardShareIds =
    boardAccess && boardAccess.sessionId === accessSessionId
      ? boardAccess.ids
      : null;
  const missingBoardShareKey =
    accessSessionId &&
    boardShareEntry &&
    knownBoardShareIds &&
    !knownBoardShareIds.includes(boardShareEntry)
      ? JSON.stringify(knownBoardShareIds)
      : null;
  useEffect(() => {
    if (!accessSessionId || !boardShareEntry || !missingBoardShareKey) return;
    const known = JSON.parse(missingBoardShareKey) as string[];
    void nextWallBoardShareIds(known, boardShareEntry)
      .then(async (next) => {
        if (!next) return;
        await setDoc(
          wallBoardAccessDoc(accessSessionId),
          { boardShareIds: next },
          { merge: true }
        );
        // Tells members to re-check access without putting share ids in the session doc.
        await updateDoc(doc(db, 'activity_wall_sessions', accessSessionId), {
          boardAccessAt: Date.now(),
        });
      })
      .catch((err) => {
        console.error('[ActivityWall] Failed to open wall to board:', err);
      });
  }, [accessSessionId, boardShareEntry, missingBoardShareKey]);

  // Walls saved before wall-level engagement flags inherit them once from their latest gallery share.
  const seededEntryIdRef = useRef<string | null>(null);
  const needsEngagementSeed =
    !!entry &&
    !!latestShareId &&
    entry.allowLikes === undefined &&
    entry.allowComments === undefined &&
    entry.allowCommentResponses === undefined;
  useEffect(() => {
    if (!needsEngagementSeed || !entry || !latestShareId) return undefined;
    if (seededEntryIdRef.current === entry.id) return undefined;
    seededEntryIdRef.current = entry.id;
    let cancelled = false;
    void getDoc(doc(db, 'shared_activity_walls', latestShareId))
      .then(async (snap) => {
        const share = snap.data() as Partial<SharedActivityWall> | undefined;
        if (cancelled || !share) return;
        await saveActivity({
          ...entry,
          allowLikes: share.allowLikes === true,
          allowComments: share.allowComments === true,
          allowCommentResponses: share.allowCommentResponses === true,
          updatedAt: Date.now(),
        });
      })
      .catch((err) => {
        console.error('[ActivityWall] Engagement seed failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [needsEngagementSeed, entry, latestShareId, saveActivity]);

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

  const { approve, reject, deletePost, movePost, pinPost, editPost } =
    useWallPostActions(sessionId);

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

  const setStudentsCanSeePosts = useCallback(
    async (visible: boolean) => {
      if (!entry || !uid) return;
      const next = {
        ...entry,
        studentsCanSeePosts: visible,
        updatedAt: Date.now(),
      };
      await saveActivity(next);
      await writeSessionMirror(uid, next);
    },
    [entry, saveActivity, uid]
  );

  const setTimelineDatesHidden = useCallback(
    async (hidden: boolean) => {
      if (!entry || !uid) return;
      const next = {
        ...entry,
        timelineDatesHidden: hidden,
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
    setStudentsCanSeePosts,
    setTimelineDatesHidden,
  };
};
