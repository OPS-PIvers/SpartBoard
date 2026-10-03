import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { TourStepList } from './TourStepList';

const set = {
  id: 'set-1',
  title: 'Boards',
  imageUrls: ['https://img/a.png', 'https://img/b.mp4', 'https://img/c.png'],
  imageKinds: ['image', 'video', 'image'],
  steps: [
    { id: 's1', label: 'Open Boards', text: 'Click it.', imageIndex: 0 },
    { id: 's2', text: 'Pick a board.', imageIndex: 0 },
    { id: 's3', text: 'Watch.', imageIndex: 1 },
    { id: 's4', text: 'Done.', imageIndex: 2 },
  ],
} as unknown as GuidedLearningSet;

describe('TourStepList', () => {
  it('numbers every step with its text', () => {
    render(<TourStepList set={set} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('1Open BoardsClick it.');
    expect(items[1]).toHaveTextContent('2Pick a board.');
  });

  it('shows each slide image once and skips videos', () => {
    const { container } = render(<TourStepList set={set} />);
    const srcs = [...container.querySelectorAll('img')].map((i) =>
      i.getAttribute('src')
    );
    expect(srcs).toEqual(['https://img/a.png', 'https://img/c.png']);
  });
});
