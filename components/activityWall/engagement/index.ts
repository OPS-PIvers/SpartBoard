import React from 'react';
import type {
  ActivityWallIdentificationMode,
  ActivityWallSubmission,
} from '@/types';
import { EngagementFooter } from './EngagementFooter';
import {
  EMPTY_LIKE_INFO,
  type EngagementFlags,
  type WallEngagement,
} from './useWallEngagement';

export { EngagementFooter } from './EngagementFooter';
export type { EngagementFooterProps } from './EngagementFooter';
export { CommentNode } from './CommentNode';
export type { CommentNodeProps } from './CommentNode';
export { CommentComposer } from './CommentComposer';
export type { CommentComposerProps } from './CommentComposer';
export { buildParticipantLabel } from './participantLabel';
export { useWallEngagement, EMPTY_LIKE_INFO } from './useWallEngagement';
export type {
  EngagementFlags,
  LikeInfo,
  PostCommentInput,
  WallEngagement,
} from './useWallEngagement';

export interface MakeEngagementFooterOptions {
  viewerUid: string | null;
  canWrite: boolean;
  flags: EngagementFlags;
  identificationMode: ActivityWallIdentificationMode;
  engagement: WallEngagement;
}

export type RenderEngagementFooter = (
  submission: ActivityWallSubmission
) => React.ReactNode;

/** Builds a `LayoutRouter` `renderFooter`; `undefined` when neither likes nor comments are on. */
export const makeEngagementFooter = ({
  viewerUid,
  canWrite,
  flags,
  identificationMode,
  engagement,
}: MakeEngagementFooterOptions): RenderEngagementFooter | undefined => {
  if (!flags.allowLikes && !flags.allowComments) return undefined;
  return function renderEngagementFooter(submission) {
    return React.createElement(EngagementFooter, {
      submission,
      viewerUid,
      canWrite,
      flags,
      identificationMode,
      likeInfo: engagement.likeIndex.get(submission.id) ?? EMPTY_LIKE_INFO,
      comments: engagement.commentsBySubmission.get(submission.id) ?? [],
      onToggleLike: engagement.toggleLike,
      onPostComment: engagement.postComment,
    });
  };
};
