import React, { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import type {
  ActivityWallComment,
  ActivityWallIdentificationMode,
} from '@/types';
import { CommentComposer } from './CommentComposer';
import type { EngagementFlags, PostCommentInput } from './useWallEngagement';

export interface CommentNodeProps {
  flags: EngagementFlags;
  identificationMode: ActivityWallIdentificationMode;
  participantLabel?: string;
  /** When false the wall hides names, so commenter labels are masked too. */
  showNames: boolean;
  submissionId: string;
  comment: ActivityWallComment;
  replies: ActivityWallComment[];
  canWrite: boolean;
  onPostComment: (input: PostCommentInput) => Promise<void>;
}

export const CommentNode: React.FC<CommentNodeProps> = ({
  flags,
  identificationMode,
  participantLabel,
  showNames,
  submissionId,
  comment,
  replies,
  canWrite,
  onPostComment,
}) => {
  const [replyOpen, setReplyOpen] = useState(false);
  const canReply = canWrite && flags.allowCommentResponses;
  const labelOf = (c: ActivityWallComment) =>
    showNames ? c.participantLabel : 'Anonymous';
  return (
    <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-bold text-slate-200">
          {labelOf(comment)}
        </p>
        <span className="shrink-0 text-[11px] text-slate-300">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
        {comment.content}
      </p>
      {canReply && (
        <button
          type="button"
          onClick={() => setReplyOpen((p) => !p)}
          className="mt-1 inline-flex items-center gap-1 rounded text-[11px] font-semibold text-white/90 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <CornerDownRight aria-hidden="true" className="h-3 w-3" />
          {replyOpen ? 'Cancel' : 'Reply'}
        </button>
      )}
      {replies.length > 0 && (
        <ul className="mt-2 ml-4 space-y-2 border-l border-white/10 pl-3">
          {replies.map((reply) => (
            <li key={reply.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-xs font-bold text-slate-200">
                  {labelOf(reply)}
                </p>
                <span className="shrink-0 text-[11px] text-slate-300">
                  {new Date(reply.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5 text-slate-200 whitespace-pre-wrap">
                {reply.content}
              </p>
            </li>
          ))}
        </ul>
      )}
      {replyOpen && canReply && (
        <div className="mt-2">
          <CommentComposer
            identificationMode={identificationMode}
            participantLabel={participantLabel}
            submissionId={submissionId}
            parentCommentId={comment.id}
            onPostComment={onPostComment}
            onDone={() => setReplyOpen(false)}
          />
        </div>
      )}
    </li>
  );
};
