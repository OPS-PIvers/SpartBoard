import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposerSheet } from './ComposerSheet';
import { makeSession } from '@/components/activityWall/render/fixtures';

vi.mock('@/config/firebase', () => ({ db: {}, storage: {}, auth: {} }));

const renderSheet = (allowedTypes: Record<string, boolean>) =>
  render(
    <ComposerSheet
      session={makeSession({
        layout: 'wall',
        allowedTypes: {
          photo: false,
          link: false,
          file: false,
          video: false,
          ...allowedTypes,
        },
      })}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      busy={false}
      progress={null}
      error={null}
    />
  );

describe('ComposerSheet with text turned off', () => {
  it('opens a video-only wall on video with no text box', () => {
    renderSheet({ text: false, video: true });
    expect(screen.queryByLabelText('Your response')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Post type' })).toBeNull();
    expect(screen.getByRole('button', { name: /post/i })).toBeDisabled();
  });

  it('offers only the types that are on', () => {
    renderSheet({ text: false, photo: true, video: true });
    expect(screen.queryByRole('button', { name: 'Text' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Photo' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Video' })).toBeInTheDocument();
  });

  it('keeps text first when it is on', () => {
    renderSheet({ photo: true });
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('Your response')).toBeInTheDocument();
  });
});
