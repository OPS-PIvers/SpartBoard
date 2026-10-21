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

  it('sorts a range by its start and names the teacher time periods', () => {
    render(
      <LayoutRouter
        session={makeSession({
          layout: 'timeline',
          timelineDates: true,
          timePeriods: [
            { id: 'war', label: 'Civil War', from: '1861', to: '1865' },
            { id: 'bad', label: 'Broken', from: 'soon', to: '1900' },
          ],
        })}
        mode="gallery"
        showNames
        submissions={[
          makeSubmission({ id: 'after', label: '1870', submittedAt: 1 }),
          makeSubmission({
            id: 'range',
            label: 'April 12, 1861 – April 9, 1865',
            submittedAt: 2,
          }),
        ]}
      />
    );
    expect(cardOrder()).toEqual(['range', 'after']);
    expect(screen.getByText('Civil War')).toBeInTheDocument();
    expect(screen.queryByText('Broken')).not.toBeInTheDocument();
  });

  it('gives each group its own lane and collects posts in no group', () => {
    render(
      <LayoutRouter
        session={makeSession({
          layout: 'timeline',
          timelineDates: true,
          timelineGroups: [
            { id: 'dakota', label: 'Dakota' },
            { id: 'settlers', label: 'Settlers' },
          ],
        })}
        mode="gallery"
        showNames
        submissions={[
          makeSubmission({ id: 'a', label: '1862', sectionId: 'settlers' }),
          makeSubmission({ id: 'b', label: '1851', sectionId: 'dakota' }),
          makeSubmission({ id: 'c', label: '1858', sectionId: 'gone' }),
        ]}
      />
    );
    const lane = (name: string) =>
      Array.from(
        screen
          .getByRole('list', { name: `${name}: posts in date order` })
          .querySelectorAll('[data-testid^="aw-timeline-card-"]')
      ).map((el) => el.getAttribute('data-testid'));
    expect(lane('Dakota')).toEqual(['aw-timeline-card-b']);
    expect(lane('Settlers')).toEqual(['aw-timeline-card-a']);
    expect(lane('No group')).toEqual(['aw-timeline-card-c']);
  });

  it('hides every date and lets the teacher show them again', () => {
    const onToggle = vi.fn();
    render(
      <LayoutRouter
        session={makeSession({
          layout: 'timeline',
          timelineDates: true,
          timelineDatesHidden: true,
        })}
        mode="widget"
        showNames
        submissions={[
          makeSubmission({ id: 'a', label: '1862', title: 'Treaty' }),
          makeSubmission({ id: 'b', label: '1776', title: 'Declaration' }),
        ]}
        onToggleTimelineDates={onToggle}
      />
    );
    expect(screen.queryByText('1862')).not.toBeInTheDocument();
    expect(screen.queryByText('1776')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open post: Treaty' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show dates' }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('shows no dates toggle outside the teacher widget', () => {
    render(
      <LayoutRouter
        session={makeSession({ layout: 'timeline', timelineDates: true })}
        mode="student"
        showNames
        submissions={submissions}
        onToggleTimelineDates={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Hide dates' })
    ).not.toBeInTheDocument();
  });
});
