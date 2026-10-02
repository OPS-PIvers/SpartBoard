import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { StudentGradeRow } from '@/utils/gradebook/studentGrades';
import type { DoneItem } from '@/utils/studentLanding';
import { DoneRow } from './LandingRows';

const showAlert = vi.fn().mockResolvedValue(undefined);
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert }),
}));

const NOW = new Date(2026, 9, 2, 15, 40).getTime();
const DAY = 24 * 60 * 60 * 1000;

const assignment: AssignmentSummary = {
  compositeId: 'quiz:q1',
  kind: 'quiz',
  sessionId: 'q1',
  title: 'Ch. 1-2 reading quiz',
  openHref: '/quiz?code=ABC123',
  channel: 'ended',
  classIds: ['c1'],
  gradingState: 'graded',
  workKind: 'work',
  dueAt: NOW - 8 * DAY,
};

const grade: StudentGradeRow = {
  sessionId: 'q1',
  kind: 'quiz',
  title: 'Ch. 1-2 reading quiz',
  dueAt: NOW - 8 * DAY,
  status: 'scored',
  points: 18,
  max: 20,
  pct: 90,
  flags: [{ id: 'late', name: 'Late', key: 'L', color: 'amber' }],
  comment: 'Strong evidence in #4.',
  updatedAt: NOW,
};

const item = (over: Partial<DoneItem>): DoneItem => ({
  key: 'quiz:q1',
  kind: 'quiz',
  sessionId: 'q1',
  title: 'Ch. 1-2 reading quiz',
  row: { assignment, state: 'turned-in' },
  missing: false,
  when: NOW - 8 * DAY,
  ...over,
});

const renderRow = (props: Partial<React.ComponentProps<typeof DoneRow>>) => {
  const onOpenGradeOnly = vi.fn();
  render(
    <DoneRow
      item={item({})}
      check={undefined}
      nowMs={NOW}
      teachers="Ms. Ortiz"
      onLockedClick={vi.fn()}
      onOpenGradeOnly={onOpenGradeOnly}
      {...props}
    />
  );
  return { onOpenGradeOnly };
};

describe('DoneRow', () => {
  it('opens the student own work in the player', () => {
    renderRow({});
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/quiz?code=ABC123'
    );
  });

  it('shows score, Late, New and the teacher comment on the Gradebook tab', () => {
    renderRow({ item: item({ grade }), gradebook: true, isNew: true });
    expect(screen.getByText('18/20')).toBeInTheDocument();
    expect(screen.getByText('Late')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Strong evidence in #4.')).toBeInTheDocument();
  });

  it('says Awaiting grade when nothing is published', () => {
    renderRow({ gradebook: true });
    expect(screen.getByText('Awaiting grade')).toBeInTheDocument();
  });

  it('explains a Missing row instead of opening it', () => {
    renderRow({
      item: item({ missing: true, row: { assignment, state: 'missing' } }),
    });
    fireEvent.click(screen.getByRole('button'));
    expect(showAlert).toHaveBeenCalledWith(
      expect.stringContaining(
        'before you turned it in. Talk to Ms. Ortiz if you need it reopened.'
      ),
      expect.objectContaining({ title: 'Ch. 1-2 reading quiz' })
    );
  });

  it('opens a graded session that left the list through the resolver', () => {
    const gradeOnly = item({ row: undefined, grade });
    const { onOpenGradeOnly } = renderRow({ item: gradeOnly, gradebook: true });
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenGradeOnly).toHaveBeenCalledWith(gradeOnly);
  });
});
