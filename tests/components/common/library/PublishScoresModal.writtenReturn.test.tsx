import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PublishScoresModal } from '@/components/common/library/PublishScoresModal';
import { RESULTS_PROTECTION_DEFAULTS } from '@/types';

describe('PublishScoresModal — written answers mode', () => {
  it('hides the control when the caller passes no written-return config', () => {
    render(
      <PublishScoresModal
        assignmentTitle="Quiz"
        currentVisibility={undefined}
        onClose={() => undefined}
        onConfirm={() => undefined}
        showProtection
      />
    );
    expect(
      screen.queryByRole('radiogroup', { name: 'Written answers' })
    ).toBeNull();
  });

  it('defaults to Handwriting and forwards the chosen mode', async () => {
    const onConfirm = vi.fn();
    render(
      <PublishScoresModal
        assignmentTitle="Quiz"
        currentVisibility={undefined}
        onClose={() => undefined}
        onConfirm={onConfirm}
        showProtection
        initialProtection={RESULTS_PROTECTION_DEFAULTS}
        writtenReturn={{}}
      />
    );
    expect(screen.getByRole('radio', { name: 'Handwriting' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Typed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        'score-only',
        RESULTS_PROTECTION_DEFAULTS,
        'typed'
      )
    );
  });

  it('starts from the assignment mode', () => {
    render(
      <PublishScoresModal
        assignmentTitle="Quiz"
        currentVisibility="score-and-responses"
        onClose={() => undefined}
        onConfirm={() => undefined}
        writtenReturn={{ initialMode: 'both' }}
      />
    );
    expect(screen.getByRole('radio', { name: 'Both' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('warns when transcripts are still pending', async () => {
    const loadPendingCount = vi.fn().mockResolvedValue(3);
    render(
      <PublishScoresModal
        assignmentTitle="Quiz"
        currentVisibility={undefined}
        onClose={() => undefined}
        onConfirm={() => undefined}
        writtenReturn={{ loadPendingCount }}
      />
    );
    expect(
      await screen.findByText(
        '3 answers still transcribing. They publish as awaiting grade.'
      )
    ).toBeInTheDocument();
    expect(loadPendingCount).toHaveBeenCalledTimes(1);
  });

  it('shows no warning when nothing is pending', async () => {
    const loadPendingCount = vi.fn().mockResolvedValue(0);
    render(
      <PublishScoresModal
        assignmentTitle="Quiz"
        currentVisibility={undefined}
        onClose={() => undefined}
        onConfirm={() => undefined}
        writtenReturn={{ loadPendingCount }}
      />
    );
    await waitFor(() => expect(loadPendingCount).toHaveBeenCalled());
    expect(screen.queryByText(/still transcribing/)).toBeNull();
  });
});
