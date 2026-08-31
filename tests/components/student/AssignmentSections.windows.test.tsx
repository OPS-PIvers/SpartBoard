/**
 * M17 C2 (§3a-C): Open now / Upcoming subdivide the Active list; Completed
 * collapses past 10 items by default.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { AssignmentSections } from '@/components/student/AssignmentSections';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';

vi.mock('@/utils/serverTime', () => ({
  getServerNow: () => 1_000_000,
}));

function makeAssignment(
  overrides: Partial<AssignmentSummary> & { compositeId: string }
): AssignmentSummary {
  return {
    kind: 'quiz',
    sessionId: overrides.compositeId,
    title: overrides.compositeId,
    openHref: `/quiz?code=${overrides.compositeId}`,
    channel: 'active',
    classIds: [],
    gradingState: 'not-graded',
    ...overrides,
  };
}

const noop = () => undefined;

describe('AssignmentSections — window subdivision', () => {
  it('renders no-window assignments under Open now', () => {
    const active = [makeAssignment({ compositeId: 'quiz:a1' })];
    render(
      <AssignmentSections
        mode="active"
        active={active}
        completed={[]}
        pseudonymUid="uid-1"
        directoryById={{}}
        onCompletionResolved={noop}
      />
    );
    expect(screen.getByText(/Open now/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Upcoming/i)).not.toBeInTheDocument();
  });

  it('splits an upcoming-window assignment into its own Upcoming section', () => {
    const active = [
      makeAssignment({ compositeId: 'quiz:open1' }),
      makeAssignment({ compositeId: 'quiz:up1', openAt: 2_000_000 }),
    ];
    render(
      <AssignmentSections
        mode="active"
        active={active}
        completed={[]}
        pseudonymUid="uid-1"
        directoryById={{}}
        onCompletionResolved={noop}
      />
    );
    expect(screen.getByText(/Open now · 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Upcoming · 1/i)).toBeInTheDocument();
  });

  it('collapses Completed past 10 items behind a "Show more" control', async () => {
    const user = userEvent.setup();
    const completed = Array.from({ length: 13 }, (_, i) =>
      makeAssignment({ compositeId: `quiz:c${i}`, channel: 'ended' })
    );
    render(
      <AssignmentSections
        mode="completed"
        active={[]}
        completed={completed}
        pseudonymUid="uid-1"
        directoryById={{}}
        onCompletionResolved={noop}
      />
    );
    expect(screen.getAllByText(/quiz/i, { selector: 'p' }).length).toBe(10);
    const showMore = screen.getByRole('button', { name: /Show 3 more/i });
    await user.click(showMore);
    expect(screen.getAllByText(/quiz/i, { selector: 'p' }).length).toBe(13);
  });
});
