// Review's Start dialog (docs/plans/QUIZ_REVIEW_SPLIT.md D14-D21).

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';

import {
  StartReviewModal,
  type StartReviewModalProps,
} from '@/components/widgets/QuizWidget/components/StartReviewModal';
import { DEFAULT_REVIEW_LAUNCH_SETTINGS } from '@/utils/reviewLaunch';

function renderModal(overrides: Partial<StartReviewModalProps> = {}) {
  const onStart = vi
    .fn<StartReviewModalProps['onStart']>()
    .mockResolvedValue(undefined);
  render(
    <StartReviewModal
      quizTitle="Chapter 5 Review"
      rosters={[]}
      initialRosterIds={[]}
      initialSettings={DEFAULT_REVIEW_LAUNCH_SETTINGS}
      skippedCount={0}
      nothingToPlay={false}
      handRaiseMode="teacher-choice"
      readAloudAvailable={false}
      onClose={vi.fn()}
      onStart={onStart}
      {...overrides}
    />
  );
  return { onStart };
}

describe('StartReviewModal', () => {
  it('offers teacher-paced now and the self-paced game as disabled', () => {
    renderModal();
    expect(screen.getByText('Start review')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Teacher-paced/ })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /Self-paced game/ })
    ).toBeDisabled();
  });

  it('starts teacher-paced with Top 5 by default', async () => {
    const { onStart } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    const [settings, rosterIds] = onStart.mock.calls[0];
    expect(settings.sessionMode).toBe('teacher');
    expect(settings.sessionOptions.boardRankLimit).toBe(5);
    expect(rosterIds).toEqual([]);
  });

  it('maps the auto switch to auto mode and keeps the board size pick', async () => {
    const { onStart } = renderModal();
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Advance automatically when everyone has answered',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Everyone' }));
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    const [settings] = onStart.mock.calls[0];
    expect(settings.sessionMode).toBe('auto');
    expect(settings.sessionOptions.boardRankLimit).toBe('all');
  });

  it('says how many questions will be skipped', () => {
    renderModal({ skippedCount: 3 });
    expect(screen.getByTestId('review-skip-notice')).toHaveTextContent(
      "3 questions can't be auto-scored and will be skipped."
    );
  });

  it('blocks Start when nothing can be played', () => {
    renderModal({ skippedCount: 2, nothingToPlay: true });
    expect(screen.getByRole('button', { name: /^Start$/ })).toBeDisabled();
  });
});
