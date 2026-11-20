import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PublishScoresModal } from '@/components/common/library/PublishScoresModal';

describe('PublishScoresModal Unpublish', () => {
  it('shows no Unpublish while nothing is published', () => {
    render(
      <PublishScoresModal
        assignmentTitle="Quiz"
        currentVisibility="none"
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );
    expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull();
  });

  it('asks before unpublishing, and Cancel keeps scores published', async () => {
    const onConfirm = vi.fn();
    render(
      <PublishScoresModal
        assignmentTitle="Quiz"
        currentVisibility="score-only"
        onClose={() => undefined}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Students will no longer be able to see their scores/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('none'));
  });
});
