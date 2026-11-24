import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import { partitionLanding } from '@/utils/studentLanding';
import { LandingClassView } from './LandingClassView';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn() }),
}));

const NOW = new Date(2026, 9, 2, 15, 40).getTime();
const DAY = 24 * 60 * 60 * 1000;

const quiz = (id: string, over: Partial<AssignmentSummary>) =>
  ({
    compositeId: `quiz:${id}`,
    kind: 'quiz',
    sessionId: id,
    title: `Quiz ${id}`,
    openHref: '#',
    channel: 'ended',
    endedAt: NOW - DAY,
    classIds: ['c1'],
    gradingState: 'not-graded',
    workKind: 'work',
    ...over,
  }) as AssignmentSummary;

const check = (turnIn: 'turned-in' | 'not-started') => ({
  turnIn,
  lockedOut: false,
  resultsOverride: null,
});

describe('LandingClassView Completed tab', () => {
  it('lists expired work under its own heading, apart from turned-in work', () => {
    const done = quiz('done', { dueAt: NOW - 2 * DAY });
    const gone = quiz('gone', { dueAt: NOW - 3 * DAY });
    const checks: TurnInMap = {
      [done.compositeId]: check('turned-in'),
      [gone.compositeId]: check('not-started'),
    };
    const p = partitionLanding([done, gone], checks, NOW);
    render(
      <LandingClassView
        cls={{
          classId: 'c1',
          name: 'English',
          teachers: 'Ms. A',
          square: '1',
          color: { bar: '#000' } as never,
        }}
        partition={p}
        checks={checks}
        tab="completed"
        onTabChange={vi.fn()}
        gradesEnabled={false}
        doneCount={p.done.length}
        nowMs={NOW}
        pseudonymUid={null}
        onLockedClick={vi.fn()}
        onOpenGradeOnly={vi.fn()}
      />
    );
    const expired = screen.getByRole('region', { name: /Expired/ });
    expect(within(expired).getByText('Quiz gone')).toBeInTheDocument();
    expect(within(expired).queryByText('Quiz done')).toBeNull();
    expect(screen.getByText('Quiz done')).toBeInTheDocument();
  });
});
