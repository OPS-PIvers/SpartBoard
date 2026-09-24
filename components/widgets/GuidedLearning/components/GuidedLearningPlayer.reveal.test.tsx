import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const question = (
  id: string,
  q: GuidedLearningStep['question']
): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'question',
  question: q,
});

// The teacher's own copy, keys included.
const authoredSet = (): GuidedLearningSet => ({
  id: 'set',
  title: 'Keys',
  imageUrls: ['https://example.com/slide.png'],
  steps: [
    question('mc', {
      type: 'multiple-choice',
      text: 'Capital of France?',
      choices: ['Paris', 'Rome', 'Oslo'],
      correctAnswer: 'Paris',
    }),
    question('match', {
      type: 'matching',
      text: 'Match the sounds',
      matchingPairs: [
        { left: 'Cat', right: 'Meow' },
        { left: 'Dog', right: 'Woof' },
      ],
    }),
    question('sort', {
      type: 'sorting',
      text: 'Order them',
      sortingItems: ['First', 'Second', 'Third'],
    }),
  ],
  mode: 'structured',
  createdAt: 0,
  updatedAt: 0,
});

const renderBoard = (
  props: Partial<React.ComponentProps<typeof GuidedLearningPlayer>> = {}
) =>
  render(
    <GuidedLearningPlayer
      set={authoredSet()}
      playerV2
      revealAnswers
      {...props}
    />
  );

const keyPanel = () => screen.queryByTestId('gl-answer-key');
const reveal = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
const next = () =>
  fireEvent.click(screen.getByRole('button', { name: /next step/i }));

describe('GuidedLearningPlayer Reveal answer (subs and the teacher board)', () => {
  it('shows no key until Reveal answer is pressed, then shows it for the room', () => {
    renderBoard();
    expect(screen.getByText('Capital of France?')).toBeInTheDocument();
    expect(keyPanel()).toBeNull();
    expect(screen.queryByText(/correct answer/i)).toBeNull();

    reveal();
    expect(keyPanel()).toHaveTextContent('Paris');
    fireEvent.click(screen.getByRole('button', { name: 'Hide answer' }));
    expect(keyPanel()).toBeNull();
  });

  it('plays the student UI: an answer is recorded, never graded', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Rome' }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    expect(screen.getByText('Answer recorded')).toBeInTheDocument();
    expect(screen.queryByText('Not quite')).toBeNull();
    expect(screen.queryByText(/correct answer/i)).toBeNull();
    expect(keyPanel()).toBeNull();
    reveal();
    expect(keyPanel()).toHaveTextContent('Paris');
  });

  it('keeps matching pairs and the sorting order hidden until revealed', () => {
    renderBoard();
    next();
    expect(screen.getByText('Match the sounds')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Cat\s*→\s*Meow/);
    expect(keyPanel()).toBeNull();
    reveal();
    expect(keyPanel()).toHaveTextContent(/Cat\s*→\s*Meow/);
    expect(keyPanel()).toHaveTextContent(/Dog\s*→\s*Woof/);

    next();
    expect(screen.getByText('Order them')).toBeInTheDocument();
    // A new question starts hidden again.
    expect(keyPanel()).toBeNull();
    const rows = () =>
      screen
        .getAllByText(/^(First|Second|Third)$/)
        .map((n) => n.textContent)
        .join(',');
    expect(rows()).not.toBe('First,Second,Third');
    reveal();
    const items = Array.from(keyPanel()?.querySelectorAll('li') ?? []).map(
      (li) => li.textContent
    );
    expect(items).toEqual(['First', 'Second', 'Third']);
  });

  it('offers no Reveal answer in v1 or in teacher mode', () => {
    renderBoard({ playerV2: false });
    expect(screen.queryByRole('button', { name: 'Reveal answer' })).toBeNull();
    cleanup();
    renderBoard({ teacherMode: true });
    expect(screen.queryByRole('button', { name: 'Reveal answer' })).toBeNull();
  });
});
