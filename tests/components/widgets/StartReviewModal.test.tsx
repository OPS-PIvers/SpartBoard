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
import { SAMPLE_ROSTERS } from '@/components/common/library/assignStepper/assignStepperTestRosters';

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
  it('offers teacher-paced and the self-paced game', () => {
    renderModal();
    expect(screen.getByText('Start review')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Teacher-paced/ })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /Self-paced game/ })
    ).toBeEnabled();
  });

  it('starts a 10 minute game with shuffle available and no podium', async () => {
    const { onStart } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Self-paced game/ }));
    expect(
      screen.queryByRole('switch', {
        name: 'Advance automatically when everyone has answered',
      })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Game length' })).toHaveValue(
      '10'
    );
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    const [settings] = onStart.mock.calls[0];
    expect(settings.sessionMode).toBe('game');
    expect(settings.gameMinutes ?? 10).toBe(10);
  });

  it('takes a custom game length', async () => {
    const { onStart } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Self-paced game/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Game length' }), {
      target: { value: 'custom' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    expect(onStart.mock.calls[0][0].gameMinutes).toBe(7);
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

  it('picks classes from the class menu when the stepper is on', async () => {
    const { onStart } = renderModal({
      classMenu: true,
      rosters: SAMPLE_ROSTERS,
      initialRosterIds: ['c1'],
    });
    expect(screen.queryByText('Assign to classes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sample 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Sample 2/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    expect(onStart.mock.calls[0][1]).toEqual(['c1', 'c2']);
  });
});
