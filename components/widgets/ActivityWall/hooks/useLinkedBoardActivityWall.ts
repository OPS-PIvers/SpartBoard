// Another teacher's Activity Wall on a Synced or View-Only board, read live; collaborators also moderate.

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
import {
  useWallPostActions,
  wallBoardAccessDoc,
  type WallPostActions,
} from './useActivityWallSession';

export interface LinkedBoardActivityWall {
  /** True once the owner has opened this wall to the board's members. */
  active: boolean;
  entry: SubShareActivityWallView | null;
  session: ActivityWallSession | null;
  /** Approved posts, or every post when `moderating`. */
  posts: ActivityWallSubmission[];
  /** True when this member may moderate and post (a Synced collaborator or the host). */
  moderating: boolean;
  sessionId: string | null;
  pendingCount: number;
  actions: WallPostActions;
}

const EMPTY_POSTS: ActivityWallSubmission[] = [];

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

/** `ownerUid`'s wall and its posts once the owner lets `shareId` read it; approved posts only unless `canModerate`. Nulls stay idle. */
export function useLinkedBoardActivityWall(
  ownerUid: string | null,
  activityId: string | null,
  shareId: string | null,
  canModerate = false
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
          listed:
            Array.isArray(ids) &&
            ids.some(
              (entry) =>
                typeof entry === 'string' && entry.split('/')[0] === shareId
            ),
        });
      },
      () => setAccessState({ key: accessKey, listed: false })
    );
  }, [accessKey, sessionId, shareId]);

  const listed =
    !!session && accessState?.key === accessKey && accessState.listed;
  const postsSessionId = listed ? sessionId : null;
  const isPhotoWall = session?.mode === 'photo';
  const postsKey = postsSessionId
    ? `${postsSessionId}:${canModerate ? 'all' : 'approved'}`
    : null;

  const [postsState, setPostsState] = useState<{
    key: string;
    posts: ActivityWallSubmission[];
  } | null>(null);

  useEffect(() => {
    if (!postsSessionId || !postsKey) return undefined;
    const posts = collection(
      db,
      'activity_wall_sessions',
      postsSessionId,
      'submissions'
    );
    return onSnapshot(
      canModerate ? posts : query(posts, where('status', '==', 'approved')),
      (snap) => {
        setPostsState({
          key: postsKey,
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
  }, [postsSessionId, postsKey, canModerate, isPhotoWall]);

  const posts =
    postsState && postsState.key === postsKey ? postsState.posts : EMPTY_POSTS;
  const active = listed && !!session;
  const moderating = active && canModerate;
  const actions = useWallPostActions(moderating ? postsSessionId : null);

  return useMemo(
    () => ({
      active,
      entry: active && session ? entryFromSession(session) : null,
      session: active ? session : null,
      posts: active ? posts : EMPTY_POSTS,
      moderating,
      sessionId: active ? postsSessionId : null,
      pendingCount: moderating
        ? posts.filter((post) => post.status === 'pending').length
        : 0,
      actions,
    }),
    [active, session, posts, moderating, postsSessionId, actions]
  );
}
