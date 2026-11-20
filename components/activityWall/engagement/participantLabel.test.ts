import { describe, expect, it } from 'vitest';
import { labelForWall } from './participantLabel';
import { participantLabelFor } from '../useActivityWallStudentSession';
import { makeEngagementFooter } from './index';
import type { EngagementFlags, WallEngagement } from './useWallEngagement';

describe('labelForWall', () => {
  it('passes the label through only when the wall shows names', () => {
    expect(labelForWall(true, 'Riley')).toBe('Riley');
    expect(labelForWall(false, 'Riley')).toBe('Anonymous');
    expect(labelForWall(undefined, 'Riley')).toBe('Anonymous');
  });
});

describe('participantLabelFor', () => {
  it('never returns the token first name or display name on a name-hidden wall', () => {
    expect(participantLabelFor(false, true, false, null, 'Riley')).toBe(
      'Anonymous'
    );
    expect(participantLabelFor(undefined, true, false, null, 'Riley')).toBe(
      'Anonymous'
    );
    expect(participantLabelFor(false, false, false, 'Pat Lee', '')).toBe(
      'Anonymous'
    );
  });

  it('keeps the first name, display name and Guest when names are shown', () => {
    expect(participantLabelFor(true, true, false, null, 'Riley')).toBe('Riley');
    expect(participantLabelFor(true, false, false, 'Pat Lee', '')).toBe('Pat');
    expect(participantLabelFor(true, false, true, null, '')).toBe('Guest');
  });
});

describe('makeEngagementFooter', () => {
  const flags: EngagementFlags = {
    allowLikes: true,
    allowComments: true,
    allowCommentResponses: false,
  };
  const engagement = {
    likeIndex: new Map(),
    commentsBySubmission: new Map(),
    toggleLike: () => Promise.resolve(),
    postComment: () => Promise.resolve(),
  } as WallEngagement;
  const submission = {
    id: 's1',
    content: 'c',
    submittedAt: 1,
    status: 'approved' as const,
  };

  const labelPassed = (showNames: boolean) => {
    const render = makeEngagementFooter({
      viewerUid: 'u',
      canWrite: true,
      flags,
      identificationMode: 'name',
      participantLabel: 'Riley',
      showNames,
      engagement,
    });
    const element = render?.(submission) as unknown as {
      props: { participantLabel?: string };
    };
    return element.props.participantLabel;
  };

  it('hands comment composers the placeholder on a name-hidden wall', () => {
    expect(labelPassed(false)).toBe('Anonymous');
    expect(labelPassed(true)).toBe('Riley');
  });
});
