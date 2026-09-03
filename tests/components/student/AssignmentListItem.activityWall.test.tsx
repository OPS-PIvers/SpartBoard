/**
 * P3-2: Activity Wall rows show Open/Closed from `acceptingResponses` and a
 * secondary "View gallery" link when a publicly-shared gallery exists.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AssignmentListItem } from '@/components/student/AssignmentListItem';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn() }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

const baseWall: AssignmentSummary = {
  compositeId: 'activity-wall:wall-1',
  kind: 'activity-wall',
  sessionId: 'wall-1',
  title: 'Gallery Walk',
  openHref: '/activity-wall/wall-1',
  channel: 'active',
  classIds: [],
  gradingState: 'not-graded',
};

describe('AssignmentListItem — Activity Wall status', () => {
  it('shows an Open chip when acceptingResponses is true', () => {
    render(
      <AssignmentListItem
        assignment={{ ...baseWall, acceptingResponses: true }}
        pseudonymUid="uid-1"
      />
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows a Closed chip, still clickable, when acceptingResponses is false', () => {
    render(
      <AssignmentListItem
        assignment={{ ...baseWall, acceptingResponses: false }}
        pseudonymUid="uid-1"
      />
    );
    expect(screen.getByText('Closed')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', baseWall.openHref);
  });

  it('does not render a View gallery link when publiclyShared is false', () => {
    render(
      <AssignmentListItem
        assignment={{
          ...baseWall,
          acceptingResponses: false,
          publiclyShared: false,
          latestShareCode: 'abc123',
        }}
        pseudonymUid="uid-1"
      />
    );
    expect(screen.queryByText('View gallery')).not.toBeInTheDocument();
  });

  it('does not render a View gallery link when latestShareCode is missing', () => {
    render(
      <AssignmentListItem
        assignment={{ ...baseWall, publiclyShared: true }}
        pseudonymUid="uid-1"
      />
    );
    expect(screen.queryByText('View gallery')).not.toBeInTheDocument();
  });

  it('renders a View gallery link to /r/{latestShareCode} when publicly shared', () => {
    render(
      <AssignmentListItem
        assignment={{
          ...baseWall,
          acceptingResponses: false,
          publiclyShared: true,
          latestShareCode: 'abc123',
        }}
        pseudonymUid="uid-1"
      />
    );
    const galleryLink = screen.getByText('View gallery');
    expect(galleryLink).toHaveAttribute(
      'href',
      `${window.location.origin}/r/abc123`
    );
  });
});
