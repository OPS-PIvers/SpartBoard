/**
 * M17 C2 (§3a-C): 'upcoming' / 'closed' render the shared muted+lock
 * treatment and are unclickable (locked cards never navigate).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { AssignmentListItem } from '@/components/student/AssignmentListItem';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';

const mockShowAlert = vi.fn().mockResolvedValue(undefined);
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: mockShowAlert }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

const assignment: AssignmentSummary = {
  compositeId: 'quiz:sess-1',
  kind: 'quiz',
  sessionId: 'sess-1',
  title: 'Fractions Quiz',
  openHref: '/quiz?code=ABC',
  channel: 'active',
  classIds: [],
  gradingState: 'not-graded',
  openAt: new Date('2030-01-01T09:00:00').getTime(),
};

describe('AssignmentListItem — window locking', () => {
  it('renders an upcoming assignment as unclickable with an Opens label', () => {
    render(
      <AssignmentListItem
        assignment={assignment}
        pseudonymUid="uid-1"
        windowState="upcoming"
      />
    );
    const link = screen.getByRole('button');
    expect(link).not.toHaveAttribute('href');
    expect(screen.getByText(/Opens/i)).toBeInTheDocument();
  });

  it('renders a closed assignment as unclickable with a Closed label', async () => {
    render(
      <AssignmentListItem
        assignment={{ ...assignment, openAt: undefined }}
        pseudonymUid="uid-1"
        windowState="closed"
      />
    );
    const link = await screen.findByRole('button');
    expect(link).not.toHaveAttribute('href');
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('shows an alert instead of navigating when a locked row is clicked', async () => {
    const user = userEvent.setup();
    render(
      <AssignmentListItem
        assignment={assignment}
        pseudonymUid="uid-1"
        windowState="upcoming"
      />
    );
    await user.click(screen.getByRole('button'));
    expect(mockShowAlert).toHaveBeenCalled();
  });

  it('renders a normal, clickable row when windowState is open', async () => {
    render(
      <AssignmentListItem
        assignment={assignment}
        pseudonymUid="uid-1"
        windowState="open"
      />
    );
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', assignment.openHref);
  });
});
