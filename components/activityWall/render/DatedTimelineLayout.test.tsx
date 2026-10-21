import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LayoutRouter } from './LayoutRouter';
import { makeSession, makeSubmission } from './fixtures';

vi.mock('@/config/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(() => Promise.resolve('https://storage.test/p.png')),
  ref: (_storage: unknown, path: string) => path,
}));

const submissions = [
  makeSubmission({ id: 'late', label: 'June 6, 1944', submittedAt: 1 }),
  makeSubmission({ id: 'none', label: 'Long ago', submittedAt: 2 }),
  makeSubmission({
    id: 'early',
    label: '500 BC',
    pinned: true,
    submittedAt: 3,
  }),
  makeSubmission({ id: 'mid', label: '1776', submittedAt: 4 }),
  makeSubmission({
    id: 'pending',
    label: '1800',
    status: 'pending',
    submittedAt: 5,
  }),
];

const cardOrder = () =>
  screen
    .getAllByTestId(/^aw-timeline-card-/)
    .map((el) => el.dataset.testid?.replace('aw-timeline-card-', ''));

describe('DatedTimelineLayout', () => {
  it('orders by date, ignores pinning, puts undated last and hides pending in the gallery', () => {
    render(
      <LayoutRouter
        session={makeSession({ layout: 'timeline', timelineDates: true })}
        mode="gallery"
        showNames
        submissions={submissions}
      />
    );
    expect(cardOrder()).toEqual(['early', 'mid', 'late', 'none']);
    const left = (id: string) =>
      parseFloat(screen.getByTestId(`aw-timeline-card-${id}`).style.left);
    expect(left('early')).toBeLessThan(left('mid'));
    expect(screen.getByText('No date')).toBeInTheDocument();
  });

  it('keeps the list timeline when the wall has no dated flag', () => {
    render(
      <LayoutRouter
        session={makeSession({ layout: 'timeline' })}
        mode="gallery"
        showNames
        submissions={submissions}
      />
    );
    expect(screen.queryByTestId(/^aw-timeline-card-/)).toBeNull();
  });

  it('opens the full post with teacher actions on click', () => {
    const onPin = vi.fn();
    render(
      <LayoutRouter
        session={makeSession({ layout: 'timeline', timelineDates: true })}
        mode="teacher"
        showNames
        submissions={submissions}
        onPin={onPin}
      />
    );
    fireEvent.click(screen.getByTestId('aw-timeline-card-mid'));
    fireEvent.click(screen.getByRole('button', { name: 'Pin post' }));
    expect(onPin).toHaveBeenCalledWith('mid', true);
    fireEvent.click(screen.getByRole('button', { name: 'Close post' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
