import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';
import { writeResume } from './player/useResume';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const step = (id: string): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  text: id,
});

const set: GuidedLearningSet = {
  id: 'set',
  schemaVersion: 3,
  title: 'Resume',
  imageUrls: ['https://example.com/slide.png'],
  steps: [step('a'), step('b'), step('c')],
  mode: 'structured',
  createdAt: 0,
  updatedAt: 0,
};

describe('GuidedLearningPlayer server-seeded resume (P8-8)', () => {
  it('offers the progress doc’s step when this device has no saved place', () => {
    render(<GuidedLearningPlayer set={set} playerV2 resumeServerIdx={2} />);
    expect(screen.getByText('Resume at step 3?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('offers the server step when it lands after the player opened', () => {
    const { rerender } = render(<GuidedLearningPlayer set={set} playerV2 />);
    expect(screen.queryByText(/resume at step/i)).toBeNull();
    rerender(<GuidedLearningPlayer set={set} playerV2 resumeServerIdx={1} />);
    expect(screen.getByText('Resume at step 2?')).toBeInTheDocument();
  });

  it('does not offer a late server step after the learner moved and came back', () => {
    const { rerender } = render(<GuidedLearningPlayer set={set} playerV2 />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    rerender(<GuidedLearningPlayer set={set} playerV2 resumeServerIdx={2} />);
    expect(screen.queryByText(/resume at step/i)).toBeNull();
  });

  it('keeps this device’s place over the server’s', () => {
    writeResume({ id: 'set', idx: 1, mode: 'try', updatedAt: Date.now() });
    render(<GuidedLearningPlayer set={set} playerV2 resumeServerIdx={2} />);
    expect(screen.getByText('Resume at step 2?')).toBeInTheDocument();
  });

  it('ignores the server step in v1', () => {
    render(<GuidedLearningPlayer set={set} resumeServerIdx={2} />);
    expect(screen.queryByText(/resume at step/i)).toBeNull();
  });
});
