import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ActivityWallComment, ActivityWallLike } from '@/types';

export interface LikeInfo {
  count: number;
  viewerLiked: boolean;
}

export interface EngagementFlags {
  allowLikes: boolean;
  allowComments: boolean;
  allowCommentResponses: boolean;
}

export interface PostCommentInput {
  submissionId: string;
  parentCommentId: string | null;
  content: string;
  participantLabel: string;
}

export interface WallEngagement {
  likeIndex: Map<string, LikeInfo>;
  commentsBySubmission: Map<string, ActivityWallComment[]>;
  toggleLike: (submissionId: string) => Promise<void>;
  postComment: (input: PostCommentInput) => Promise<void>;
}

export const EMPTY_LIKE_INFO: LikeInfo = { count: 0, viewerLiked: false };

const readLike = (
  id: string,
  data: Record<string, unknown>
): ActivityWallLike => ({
  id,
  submissionId: typeof data.submissionId === 'string' ? data.submissionId : '',
  authorUid: typeof data.authorUid === 'string' ? data.authorUid : '',
  createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
});

const readComment = (
  id: string,
  data: Record<string, unknown>
): ActivityWallComment => ({
  id: typeof data.id === 'string' ? data.id : id,
  submissionId: typeof data.submissionId === 'string' ? data.submissionId : '',
  parentCommentId:
    typeof data.parentCommentId === 'string' ? data.parentCommentId : null,
  content: typeof data.content === 'string' ? data.content : '',
  participantLabel:
    typeof data.participantLabel === 'string'
      ? data.participantLabel
      : 'Anonymous',
  authorUid: typeof data.authorUid === 'string' ? data.authorUid : '',
  createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
});

/** Session-level likes + comments; subscribes only to the kinds the wall enables. */
export const useWallEngagement = (
  sessionId: string | null,
  viewerUid: string | null,
  enabled: { likes: boolean; comments: boolean }
): WallEngagement => {
  const [likes, setLikes] = useState<ActivityWallLike[]>([]);
  const [comments, setComments] = useState<ActivityWallComment[]>([]);

  useEffect(() => {
    if (!sessionId || !enabled.likes) return;
    const unsubscribe = onSnapshot(
      query(collection(db, 'activity_wall_sessions', sessionId, 'likes')),
      (snap) => {
        setLikes(
          snap.docs.map((d) =>
            readLike(d.id, d.data() as Record<string, unknown>)
          )
        );
      },
      (err) => {
        console.error('[ActivityWallEngagement] Likes snapshot error:', err);
      }
    );
    return () => {
      unsubscribe();
      setLikes([]);
    };
  }, [sessionId, enabled.likes]);

  useEffect(() => {
    if (!sessionId || !enabled.comments) return;
    const unsubscribe = onSnapshot(
      query(collection(db, 'activity_wall_sessions', sessionId, 'comments')),
      (snap) => {
        setComments(
          snap.docs
            .map((d) => readComment(d.id, d.data() as Record<string, unknown>))
            .sort((a, b) => a.createdAt - b.createdAt)
        );
      },
      (err) => {
        console.error('[ActivityWallEngagement] Comments snapshot error:', err);
      }
    );
    return () => {
      unsubscribe();
      setComments([]);
    };
  }, [sessionId, enabled.comments]);

  const likeIndex = useMemo(() => {
    const map = new Map<string, LikeInfo>();
    likes.forEach((like) => {
      const entry = map.get(like.submissionId) ?? {
        count: 0,
        viewerLiked: false,
      };
      entry.count += 1;
      if (viewerUid !== null && like.authorUid === viewerUid)
        entry.viewerLiked = true;
      map.set(like.submissionId, entry);
    });
    return map;
  }, [likes, viewerUid]);

  const commentsBySubmission = useMemo(() => {
    const map = new Map<string, ActivityWallComment[]>();
    comments.forEach((comment) => {
      const list = map.get(comment.submissionId) ?? [];
      list.push(comment);
      map.set(comment.submissionId, list);
    });
    return map;
  }, [comments]);

  const toggleLike = useCallback(
    async (submissionId: string) => {
      if (!sessionId || !viewerUid) return;
      const likeDocId = `${submissionId}__${viewerUid}`;
      const likeRef = doc(
        db,
        'activity_wall_sessions',
        sessionId,
        'likes',
        likeDocId
      );
      if (likeIndex.get(submissionId)?.viewerLiked) {
        await deleteDoc(likeRef);
        return;
      }
      await setDoc(likeRef, {
        id: likeDocId,
        submissionId,
        authorUid: viewerUid,
        createdAt: Date.now(),
      });
    },
    [sessionId, viewerUid, likeIndex]
  );

  const postComment = useCallback(
    async (input: PostCommentInput) => {
      if (!sessionId || !viewerUid) return;
      const commentId = crypto.randomUUID();
      await setDoc(
        doc(db, 'activity_wall_sessions', sessionId, 'comments', commentId),
        {
          id: commentId,
          submissionId: input.submissionId,
          parentCommentId: input.parentCommentId,
          content: input.content.trim().slice(0, 2000),
          participantLabel: input.participantLabel,
          authorUid: viewerUid,
          createdAt: Date.now(),
        }
      );
    },
    [sessionId, viewerUid]
  );

  return { likeIndex, commentsBySubmission, toggleLike, postComment };
};
