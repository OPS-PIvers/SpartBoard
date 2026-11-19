import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionAudioButton } from '@/components/quiz/QuestionAudioButton';

const audio = {
  driveFileId: 'f1',
  durationSec: 12,
  mimeType: 'audio/mp4',
  playLimit: 3,
};

describe('QuestionAudioButton play limit', () => {
  it('shows plays used out of plays allowed', () => {
    render(<QuestionAudioButton audio={audio} viewsUsed={1} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Play audio (1/3)');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('locks the button once every play is used', () => {
    render(<QuestionAudioButton audio={audio} viewsUsed={3} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Play audio (3/3)');
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('never limits a teacher view', () => {
    render(<QuestionAudioButton audio={audio} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Play audio');
    expect(button.hasAttribute('disabled')).toBe(false);
  });
});
