import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { SubmitBlockedNotice } from './SubmitBlockedNotice';

const QUESTIONS = [
  { id: 'q2', index: 1, text: 'Explain your reasoning out loud' },
];

describe('SubmitBlockedNotice', () => {
  it('renders nothing when no slot is open', () => {
    const { container } = render(
      <SubmitBlockedNotice questions={[]} onJump={() => undefined} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('states the map sentence and names the open question', () => {
    render(
      <SubmitBlockedNotice questions={QUESTIONS} onJump={() => undefined} />
    );
    expect(
      screen.getByText(/One question still needs a recording/i)
    ).toBeTruthy();
    expect(
      screen.getByText(
        /stays incomplete and the assignment cannot be submitted/i
      )
    ).toBeTruthy();
    expect(screen.getByText(/Explain your reasoning out loud/i)).toBeTruthy();
  });

  it('jumps to the question the student must record', () => {
    const onJump = vi.fn();
    render(<SubmitBlockedNotice questions={QUESTIONS} onJump={onJump} />);
    fireEvent.click(screen.getByRole('button', { name: /Go to question 2/i }));
    expect(onJump).toHaveBeenCalledWith(1);
  });

  it('renders a dark card when light is false', () => {
    const { container } = render(
      <SubmitBlockedNotice
        questions={QUESTIONS}
        light={false}
        onJump={() => undefined}
      />
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('bg-slate-800/60');
    expect(section?.className).not.toContain('bg-white/90');
  });
});
