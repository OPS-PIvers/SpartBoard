import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PublishInProgressDialog } from './PublishInProgressDialog';

describe('PublishInProgressDialog', () => {
  it('shows the message and routes each choice', () => {
    const onConfirm = vi.fn();
    const onEndAndPublish = vi.fn();
    const onCancel = vi.fn();
    render(
      <PublishInProgressDialog
        message="The quiz is currently in progress. Publish scores anyway?"
        onConfirm={onConfirm}
        onEndAndPublish={onEndAndPublish}
        onCancel={onCancel}
      />
    );
    expect(
      screen.getByText(
        'The quiz is currently in progress. Publish scores anyway?'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'End & Publish Scores' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onEndAndPublish).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
