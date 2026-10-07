import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { TourStepList } from './TourStepList';

const thumb = (url: string, anchor = 'dock.boards') => ({
  url,
  anchor,
  w: 640,
  h: 360,
});

const set = {
  id: 'set-1',
  title: 'Boards',
  mode: 'tour',
  steps: [
    {
      id: 's1',
      label: 'Open Boards',
      text: 'Click it.',
      tour: {
        anchor: 'dock.boards',
        action: 'click',
        thumbnail: thumb('https://img/a.png'),
      },
    },
    {
      id: 's2',
      text: 'Pick a board.',
      tour: {
        anchor: 'dock.boards',
        action: 'click',
        thumbnail: thumb('https://img/a.png'),
      },
    },
    {
      id: 's3',
      text: 'Watch.',
      tour: { anchor: 'board.whole', action: 'observe' },
    },
    {
      id: 's4',
      text: 'Done.',
      tour: {
        anchor: 'dock.boards',
        action: 'click',
        thumbnail: thumb('https://img/c.png'),
      },
    },
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

  it('shows each thumbnail once and skips steps without one', () => {
    const { container } = render(<TourStepList set={set} />);
    const srcs = [...container.querySelectorAll('img')].map((i) =>
      i.getAttribute('src')
    );
    expect(srcs).toEqual(['https://img/a.png', 'https://img/c.png']);
  });

  it('lists a tour with no pictures at all', () => {
    const bare = {
      ...set,
      steps: set.steps.map(({ tour, ...s }) => ({
        ...s,
        tour: tour && { anchor: tour.anchor, action: tour.action },
      })),
    } as GuidedLearningSet;
    const { container } = render(<TourStepList set={bare} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to the legacy slide when a step has no thumbnail', () => {
    const legacy = {
      ...set,
      imageUrls: ['https://img/slide0.png', 'https://img/clip.mp4'],
      imageKinds: ['image', 'video'],
      steps: [
        { id: 'a', text: 'One.', imageIndex: 0, tour: { anchor: 'x' } },
        { id: 'b', text: 'Two.', imageIndex: 0, tour: { anchor: 'x' } },
        { id: 'c', text: 'Three.', imageIndex: 1, tour: { anchor: 'x' } },
      ],
    } as unknown as GuidedLearningSet;
    const { container } = render(<TourStepList set={legacy} />);
    const srcs = [...container.querySelectorAll('img')].map((i) =>
      i.getAttribute('src')
    );
    expect(srcs).toEqual(['https://img/slide0.png']);
  });
});
