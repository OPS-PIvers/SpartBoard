import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { LandingRow } from '@/utils/studentLanding';
import { WorkRow } from './LandingRows';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn() }),
}));

const NOW = new Date(2026, 9, 2, 10, 12).getTime();

const base: AssignmentSummary = {
  compositeId: 'quiz:q1',
  kind: 'quiz',
  sessionId: 'q1',
  title: 'Chapter 7 quiz',
  openHref: '/quiz?code=ABC123',
  channel: 'active',
  classIds: ['c1'],
  gradingState: 'not-graded',
  workKind: 'work',
};

const manual = (state: 'open' | 'closed'): AssignmentSummary => ({
  ...base,
  periodGate: {
    accessMode: 'assessment',
    periodAccess: {
      c1: {
        state,
        openAt: null,
        closeAt: null,
        bellPeriodId: null,
        verified: true,
        label: 'P1',
      },
    },
    periodKeys: ['c1'],
  },
});

const renderRow = (row: LandingRow) =>
  render(<WorkRow row={row} nowMs={NOW} pseudonymUid="s1" />);

describe('WorkRow', () => {
  it('shows Open on an available row', () => {
    renderRow({ assignment: base, state: 'open' });
    expect(screen.getByRole('link')).toHaveAttribute('href', base.openHref);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('Live')).toBeNull();
  });

  it('marks a started Manual start class Live, with Open', () => {
    renderRow({ assignment: manual('open'), state: 'open' });
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('dims a class not started yet, with no Open, but still links to the waiting screen', () => {
    renderRow({ assignment: manual('closed'), state: 'open' });
    expect(screen.getByText('Not started yet')).toBeInTheDocument();
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.queryByText('Live')).toBeNull();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', base.openHref);
    expect(link.className).toContain('opacity-60');
  });

  it('keeps an upcoming row locked with no Open', () => {
    renderRow({
      assignment: { ...base, openAt: NOW + 86_400_000 },
      state: 'upcoming',
    });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Open')).toBeNull();
  });

  it('shows In progress and Open on a started attempt', () => {
    renderRow({ assignment: base, state: 'in-progress' });
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });
});
