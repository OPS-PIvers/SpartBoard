import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionAudioButton } from '@/components/quiz/QuestionAudioButton';

const audio = {
  driveFileId: 'f1',
  durationSec: 12,
  mimeType: 'audio/mp4',
  playLimit: 2,
};

describe('QuestionAudioButton view limit', () => {
  it('shows the views left for a student', () => {
    render(<QuestionAudioButton audio={audio} viewsUsed={1} />);
    expect(screen.getByText('1 view left')).toBeTruthy();
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
  });

  it('locks the button once the views are used', () => {
    render(<QuestionAudioButton audio={audio} viewsUsed={2} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toContain('No views left');
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('never limits a teacher view', () => {
    render(<QuestionAudioButton audio={audio} />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/views? left/)).toBeNull();
  });
});
