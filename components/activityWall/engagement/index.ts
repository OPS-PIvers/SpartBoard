import React from 'react';
import type {
  ActivityWallIdentificationMode,
  ActivityWallSubmission,
} from '@/types';
import { EngagementFooter } from './EngagementFooter';
import { ANONYMOUS_PARTICIPANT_LABEL } from './participantLabel';
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
export {
  ANONYMOUS_PARTICIPANT_LABEL,
  buildParticipantLabel,
  labelForWall,
} from './participantLabel';
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
  /** Known viewer label (student page); comment composers skip the name/PIN inputs. */
  participantLabel?: string;
  /** Wall's name visibility; false masks commenter labels. */
  showNames: boolean;
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
  participantLabel: viewerLabel,
  showNames,
  engagement,
}: MakeEngagementFooterOptions): RenderEngagementFooter | undefined => {
  if (!flags.allowLikes && !flags.allowComments) return undefined;
  // A name-hidden wall never stores a commenter's name, so the composer skips its name inputs too.
  const participantLabel = showNames
    ? viewerLabel
    : ANONYMOUS_PARTICIPANT_LABEL;
  return function renderEngagementFooter(submission) {
    return React.createElement(EngagementFooter, {
      submission,
      viewerUid,
      canWrite,
      flags,
      identificationMode,
      participantLabel,
      showNames,
      likeInfo: engagement.likeIndex.get(submission.id) ?? EMPTY_LIKE_INFO,
      comments: engagement.commentsBySubmission.get(submission.id) ?? [],
      onToggleLike: engagement.toggleLike,
      onPostComment: engagement.postComment,
    });
  };
};
