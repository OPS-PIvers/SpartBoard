import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeSubmission } from '@/components/activityWall/render/fixtures';
import { EngagementFooter, type EngagementFooterProps } from './index';
import type { ActivityWallComment } from '@/types';

const comment = (
  overrides: Partial<ActivityWallComment> = {}
): ActivityWallComment => ({
  id: 'c1',
  submissionId: 'sub-1',
  parentCommentId: null,
  content: 'Nice work',
  participantLabel: 'Ada',
  authorUid: 'other',
  createdAt: 1000,
  ...overrides,
});

const renderFooter = (overrides: Partial<EngagementFooterProps> = {}) => {
  const props: EngagementFooterProps = {
    submission: makeSubmission(),
    viewerUid: 'viewer-1',
    canWrite: true,
    flags: {
      allowLikes: true,
      allowComments: true,
      allowCommentResponses: true,
    },
    identificationMode: 'anonymous',
    showNames: true,
    likeInfo: { count: 0, viewerLiked: false },
    comments: [],
    onToggleLike: vi.fn().mockResolvedValue(undefined),
    onPostComment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<EngagementFooter {...props} />);
  return props;
};

describe('EngagementFooter', () => {
  it('hides the like button when allowLikes is false', () => {
    renderFooter({
      flags: {
        allowLikes: false,
        allowComments: true,
        allowCommentResponses: false,
      },
    });
    expect(screen.queryByLabelText('Like')).not.toBeInTheDocument();
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });

  it('hides the comments section when allowComments is false', () => {
    renderFooter({
      flags: {
        allowLikes: true,
        allowComments: false,
        allowCommentResponses: false,
      },
    });
    expect(screen.getByLabelText('Like')).toBeInTheDocument();
    expect(screen.queryByText(/no comments yet/i)).not.toBeInTheDocument();
  });

  it('shows counts but disables the like button and hides the composer for anonymous viewers', () => {
    renderFooter({
      canWrite: false,
      likeInfo: { count: 3, viewerLiked: false },
      comments: [comment()],
    });
    expect(screen.getByLabelText('Like')).toBeDisabled();
    expect(screen.getByLabelText('Like')).toHaveTextContent('3');
    expect(screen.getByText('Nice work')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Leave a comment…')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
  });

  it('calls onToggleLike with the submission id', async () => {
    const props = renderFooter();
    fireEvent.click(screen.getByLabelText('Like'));
    await waitFor(() =>
      expect(props.onToggleLike).toHaveBeenCalledWith('sub-1')
    );
  });

  it('shows the reply button only when allowCommentResponses is on', () => {
    renderFooter({
      comments: [comment()],
      flags: {
        allowLikes: true,
        allowComments: true,
        allowCommentResponses: false,
      },
    });
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
  });

  it('opens a reply composer that posts with the parent comment id', async () => {
    const props = renderFooter({
      comments: [comment(), comment({ id: 'c2', parentCommentId: 'c1' })],
    });
    expect(screen.getByText(/1 comment$/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reply'));
    const box = screen.getByPlaceholderText('Write a reply…');
    fireEvent.change(box, { target: { value: 'Thanks!' } });
    fireEvent.submit(box.closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(props.onPostComment).toHaveBeenCalledWith({
        submissionId: 'sub-1',
        parentCommentId: 'c1',
        content: 'Thanks!',
        participantLabel: 'Anonymous',
      })
    );
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('Write a reply…')
      ).not.toBeInTheDocument()
    );
  });

  it('requires a name in name mode and builds the participant label', async () => {
    const props = renderFooter({ identificationMode: 'name' });
    const box = screen.getByPlaceholderText('Leave a comment…');
    fireEvent.change(box, { target: { value: 'Hello' } });
    fireEvent.submit(box.closest('form') as HTMLFormElement);
    expect(await screen.findByText('Please enter your name.')).toBeVisible();
    expect(props.onPostComment).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Your name'), {
      target: { value: 'Grace' },
    });
    fireEvent.submit(box.closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(props.onPostComment).toHaveBeenCalledWith(
        expect.objectContaining({ participantLabel: 'Grace' })
      )
    );
  });

  it('surfaces a post failure in the composer', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    renderFooter({
      onPostComment: vi.fn().mockRejectedValue(new Error('denied')),
    });
    const box = screen.getByPlaceholderText('Leave a comment…');
    fireEvent.change(box, { target: { value: 'Hello' } });
    fireEvent.submit(box.closest('form') as HTMLFormElement);
    expect(
      await screen.findByText(/could not post your comment/i)
    ).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('disables engagement controls for a still-pending submission', () => {
    renderFooter({
      submission: makeSubmission({ status: 'pending' }),
      comments: [comment()],
    });
    expect(screen.getByLabelText('Like')).toBeDisabled();
    expect(
      screen.queryByPlaceholderText('Leave a comment…')
    ).not.toBeInTheDocument();
  });

  it('treats a legacy submission with no status field as approved, matching the server rule default', () => {
    const { status: _status, ...legacySubmission } = makeSubmission();
    renderFooter({
      submission: legacySubmission as EngagementFooterProps['submission'],
    });
    expect(screen.getByLabelText('Like')).not.toBeDisabled();
    expect(screen.getByPlaceholderText('Leave a comment…')).toBeInTheDocument();
  });

  it('masks commenter labels when showNames is false', () => {
    renderFooter({
      showNames: false,
      comments: [comment(), comment({ id: 'c2', parentCommentId: 'c1' })],
    });
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
    expect(screen.getAllByText('Anonymous')).toHaveLength(2);
  });
});
