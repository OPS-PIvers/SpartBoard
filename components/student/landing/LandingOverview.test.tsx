import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import { CLASS_COLOR_PALETTE } from '@/utils/studentClassColors';
import type { LandingPartition, LandingRow } from '@/utils/studentLanding';
import { LandingOverview } from './LandingOverview';
import type { LandingClass } from './types';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn() }),
}));

const NOW = new Date(2026, 9, 2, 15, 40).getTime();
const DAY = 24 * 60 * 60 * 1000;

const cls: LandingClass = {
  classId: 'c1',
  name: 'Biology 9',
  teachers: 'Ms. Hanson',
  square: '1',
  color: CLASS_COLOR_PALETTE[0],
};

const resource = (n: number): LandingRow => {
  const a: AssignmentSummary = {
    compositeId: `flashcards:r${n}`,
    kind: 'flashcards',
    sessionId: `r${n}`,
    title: `Resource ${n}`,
    openHref: `/flashcards?r=${n}`,
    channel: 'active',
    classIds: ['c1'],
    gradingState: 'not-graded',
    workKind: 'resource',
    flashcardKind: 'study',
    closeAt: NOW + n * DAY,
  };
  return { assignment: a, state: 'resource' };
};

const partition = (count: number): LandingPartition => ({
  live: [],
  work: [],
  resources: Array.from({ length: count }, (_, i) => resource(i + 1)),
  done: [],
});

const renderOverview = (count: number, showResources: boolean) =>
  render(
    <LandingOverview
      partition={partition(count)}
      classOf={() => cls}
      firstName="Maya"
      nowMs={NOW}
      pseudonymUid="s1"
      showResources={showResources}
    />
  );

describe('LandingOverview resources', () => {
  it('is hidden when the flag is off', () => {
    renderOverview(2, false);
    expect(screen.queryByRole('heading', { name: 'Resources' })).toBeNull();
    expect(screen.queryByText('Resource 1')).toBeNull();
  });

  it('is hidden when there are no resources', () => {
    renderOverview(0, true);
    expect(screen.queryByRole('heading', { name: 'Resources' })).toBeNull();
  });

  it('shows three with their class, then expands to all', () => {
    renderOverview(5, true);
    expect(screen.getByRole('heading', { name: 'Resources' })).toBeTruthy();
    expect(screen.getByText('Resource 3')).toBeTruthy();
    expect(screen.queryByText('Resource 4')).toBeNull();
    expect(screen.getAllByText('Biology 9')).toHaveLength(3);
    fireEvent.click(
      screen.getByRole('button', { name: 'See all 5 resources' })
    );
    expect(screen.getByText('Resource 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Resource 5')).toBeNull();
  });

  it('has no See all link with three or fewer', () => {
    renderOverview(3, true);
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull();
  });
});
