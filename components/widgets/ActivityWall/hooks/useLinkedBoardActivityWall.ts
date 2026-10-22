// Another teacher's Activity Wall on a Synced or View-Only board, read live and read-only.

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  ActivityWallSession,
  ActivityWallSubmission,
  SubShareActivityWallView,
} from '@/types';
import { normalizeActivityWallSubmission } from '@/utils/activityWallNormalize';
import { activityWallSessionId } from '@/utils/activityWallLinks';
import { wallBoardAccessDoc } from './useActivityWallSession';

export interface LinkedBoardActivityWall {
  /** True once the owner has opened this wall to the board's members. */
  active: boolean;
  entry: SubShareActivityWallView | null;
  session: ActivityWallSession | null;
  posts: ActivityWallSubmission[];
}

const EMPTY_POSTS: ActivityWallSubmission[] = [];
const INACTIVE: LinkedBoardActivityWall = {
  active: false,
  entry: null,
  session: null,
  posts: EMPTY_POSTS,
};

const entryFromSession = (
  session: ActivityWallSession
): SubShareActivityWallView => ({
  id: session.activityId,
  title: session.title,
  prompt: session.prompt,
  mode: session.mode,
  moderationEnabled: session.moderationEnabled,
  identificationMode: session.identificationMode,
  createdAt: session.updatedAt,
  updatedAt: session.updatedAt,
  layout: session.layout,
  sections: session.sections,
  tableRows: session.tableRows,
  tableCols: session.tableCols,
  mapCenter: session.mapCenter,
  allowedTypes: session.allowedTypes,
  appearance: session.appearance,
  allowGuests: session.allowGuests,
  showNames: session.showNames,
  maxPostsPerStudent: session.maxPostsPerStudent,
  allowStudentEdit: session.allowStudentEdit,
  allowStudentDelete: session.allowStudentDelete,
  acceptingResponses: session.acceptingResponses,
  studentsCanSeePosts: session.studentsCanSeePosts,
  allowLikes: session.allowLikes,
  allowComments: session.allowComments,
  allowCommentResponses: session.allowCommentResponses,
});

/** `ownerUid`'s wall and approved posts, once the owner lets `shareId` read it; nulls stay idle. */
export function useLinkedBoardActivityWall(
  ownerUid: string | null,
  activityId: string | null,
  shareId: string | null
): LinkedBoardActivityWall {
  const sessionId =
    ownerUid && activityId && shareId
      ? activityWallSessionId(ownerUid, activityId)
      : null;

  const [sessionState, setSessionState] = useState<{
    sessionId: string;
    session: ActivityWallSession | null;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) return undefined;
    return onSnapshot(
      doc(db, 'activity_wall_sessions', sessionId),
      (snap) => {
        setSessionState({
          sessionId,
          session: snap.exists() ? (snap.data() as ActivityWallSession) : null,
        });
      },
      (err) => {
        console.error('[ActivityWall] Shared board wall listener failed:', err);
      }
    );
  }, [sessionId]);

  const session =
    sessionState && sessionState.sessionId === sessionId
      ? sessionState.session
      : null;
  // Re-read on every owner change: a denied read means this board isn't listed (yet).
  const accessKey =
    session && sessionId ? `${sessionId}|${session.boardAccessAt ?? 0}` : null;
  const [accessState, setAccessState] = useState<{
    key: string;
    listed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!accessKey || !sessionId || !shareId) return undefined;
    return onSnapshot(
      wallBoardAccessDoc(sessionId),
      (snap) => {
        const ids: unknown = snap.data()?.boardShareIds;
        setAccessState({
          key: accessKey,
          listed: Array.isArray(ids) && ids.includes(shareId),
        });
      },
      () => setAccessState({ key: accessKey, listed: false })
    );
  }, [accessKey, sessionId, shareId]);

  const listed =
    !!session && accessState?.key === accessKey && accessState.listed;
  const postsSessionId = listed ? sessionId : null;
  const isPhotoWall = session?.mode === 'photo';

  const [postsState, setPostsState] = useState<{
    sessionId: string;
    posts: ActivityWallSubmission[];
  } | null>(null);

  useEffect(() => {
    if (!postsSessionId) return undefined;
    return onSnapshot(
      query(
        collection(db, 'activity_wall_sessions', postsSessionId, 'submissions'),
        where('status', '==', 'approved')
      ),
      (snap) => {
        setPostsState({
          sessionId: postsSessionId,
          posts: snap.docs.map((docSnap) =>
            normalizeActivityWallSubmission(
              docSnap.id,
              docSnap.data() as Partial<ActivityWallSubmission>,
              isPhotoWall
            )
          ),
        });
      },
      (err) => {
        console.error(
          '[ActivityWall] Shared board posts listener failed:',
          err
        );
      }
    );
  }, [postsSessionId, isPhotoWall]);

  const posts =
    postsState && postsState.sessionId === postsSessionId
      ? postsState.posts
      : EMPTY_POSTS;

  return useMemo(
    () =>
      listed && session
        ? { active: true, entry: entryFromSession(session), session, posts }
        : INACTIVE,
    [listed, session, posts]
  );
}
