import React, { useMemo, useState } from 'react';
import { Heart, MessageSquare } from 'lucide-react';
import type {
  ActivityWallComment,
  ActivityWallIdentificationMode,
  ActivityWallSubmission,
} from '@/types';
import { CommentComposer } from './CommentComposer';
import { CommentNode } from './CommentNode';
import type {
  EngagementFlags,
  LikeInfo,
  PostCommentInput,
} from './useWallEngagement';

export interface EngagementFooterProps {
  submission: ActivityWallSubmission;
  viewerUid: string | null;
  /** Anonymous viewers see counts and threads but get no like button or composer. */
  canWrite: boolean;
  flags: EngagementFlags;
  identificationMode: ActivityWallIdentificationMode;
  participantLabel?: string;
  /** When false the wall hides names, so commenter labels are masked too. */
  showNames: boolean;
  likeInfo: LikeInfo;
  comments: ActivityWallComment[];
  onToggleLike: (submissionId: string) => Promise<void>;
  onPostComment: (input: PostCommentInput) => Promise<void>;
}

export const EngagementFooter: React.FC<EngagementFooterProps> = ({
  submission,
  viewerUid,
  canWrite,
  flags,
  identificationMode,
  participantLabel,
  showNames,
  likeInfo,
  comments,
  onToggleLike,
  onPostComment,
}) => {
  const topLevel = comments.filter((c) => c.parentCommentId === null);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ActivityWallComment[]>();
    comments
      .filter((c) => c.parentCommentId !== null)
      .forEach((c) => {
        const list = map.get(c.parentCommentId as string) ?? [];
        list.push(c);
        map.set(c.parentCommentId as string, list);
      });
    return map;
  }, [comments]);

  const [likeBusy, setLikeBusy] = useState(false);
  // A pending post's engagement writes are rejected server-side (firestore.rules' awEngagementSubmissionOk) — disable rather than show a dead control.
  const writable =
    canWrite &&
    viewerUid !== null &&
    (submission.status ?? 'approved') === 'approved';

  const toggleLike = async () => {
    if (!flags.allowLikes || likeBusy || !writable) return;
    setLikeBusy(true);
    try {
      await onToggleLike(submission.id);
    } catch (err) {
      console.error('[ActivityWallEngagement] Like toggle failed:', err);
    } finally {
      setLikeBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <div className="flex items-center justify-end gap-3">
        {flags.allowLikes && (
          <button
            type="button"
            onClick={() => void toggleLike()}
            disabled={likeBusy || !writable}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50 ${
              likeInfo.viewerLiked
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
            aria-pressed={likeInfo.viewerLiked}
            aria-label={likeInfo.viewerLiked ? 'Unlike' : 'Like'}
          >
            <Heart
              aria-hidden="true"
              className={`h-4 w-4 ${likeInfo.viewerLiked ? 'fill-rose-400' : ''}`}
            />
            {likeInfo.count}
          </button>
        )}
      </div>

      {flags.allowComments && (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
            {topLevel.length === 0
              ? 'No comments yet'
              : `${topLevel.length} comment${topLevel.length === 1 ? '' : 's'}`}
          </div>
          {topLevel.length > 0 && (
            <ul className="space-y-2">
              {topLevel.map((comment) => (
                <CommentNode
                  key={comment.id}
                  flags={flags}
                  identificationMode={identificationMode}
                  participantLabel={participantLabel}
                  showNames={showNames}
                  submissionId={submission.id}
                  comment={comment}
                  replies={repliesByParent.get(comment.id) ?? []}
                  canWrite={writable}
                  onPostComment={onPostComment}
                />
              ))}
            </ul>
          )}
          {writable && (
            <CommentComposer
              identificationMode={identificationMode}
              participantLabel={participantLabel}
              submissionId={submission.id}
              parentCommentId={null}
              onPostComment={onPostComment}
            />
          )}
        </div>
      )}
    </div>
  );
};
