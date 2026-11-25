import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ImageLightbox } from './ImageLightbox';
import { AnswerImageZoomButton } from '@/components/quiz/AnswerImage';

describe('ImageLightbox focus', () => {
  it('moves focus to Close and keeps Tab inside', async () => {
    const user = userEvent.setup();
    render(<ImageLightbox src="a.png" alt="Cat" onClose={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close image' });
    expect(close).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it('returns focus to the enlarge button on close', async () => {
    const user = userEvent.setup();
    render(<AnswerImageZoomButton src="a.png" label="Cat" />);
    const enlarge = screen.getByRole('button', { name: /Enlarge picture/ });
    await user.click(enlarge);
    expect(screen.getByRole('button', { name: 'Close image' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(enlarge).toHaveFocus();
  });

  it('wraps Tab across several buttons when actions are passed', async () => {
    const user = userEvent.setup();
    render(
      <ImageLightbox
        src="a.png"
        alt="Cat"
        onClose={vi.fn()}
        actions={<button type="button">Remove</button>}
      />
    );
    const close = screen.getByRole('button', { name: 'Close image' });
    const remove = screen.getByRole('button', { name: 'Remove' });
    await user.tab();
    expect(remove).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(remove).toHaveFocus();
  });

  it('expands the enlarge button hit area without growing it', () => {
    render(<AnswerImageZoomButton src="a.png" label="Cat" />);
    expect(screen.getByRole('button', { name: /Enlarge picture/ })).toHaveClass(
      'touch-target-expand',
      'h-8',
      'w-8'
    );
  });
});
