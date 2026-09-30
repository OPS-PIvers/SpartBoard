import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClassRoster, Student } from '@/types';
import {
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  type GradeIndexRow,
} from '@/utils/gradebook/gradebookCore';
import type { GradebookSource } from '@/hooks/useGradebookSource';
import { GradebookProvider } from '@/components/gradebook/GradebookProvider';
import { GradebookAnalysis } from './GradebookAnalysis';

const nav = vi.hoisted(() => vi.fn());
vi.mock('@/utils/plcPath', async (orig) => ({
  ...(await orig<typeof import('@/utils/plcPath')>()),
  spaNavigate: nav,
}));
vi.mock('@/hooks/useStandardsCatalog', () => ({
  useStandardsCatalog: () => ({ benchmarks: [], loading: false, error: null }),
}));

const NOW = new Date(2026, 9, 1).getTime();
const students: Student[] = [
  { id: 's1', firstName: 'Ana', lastName: 'Ruiz', pin: '1' },
  { id: 's2', firstName: 'Ben', lastName: 'Adams', pin: '2' },
];
const roster: ClassRoster = {
  id: 'r1',
  name: 'English 8 · Period 1',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  classlinkClassId: 'c1',
  students,
  groups: [{ id: 'g1', name: 'Table 1', studentIds: ['s1'] }],
};

// Ana: 90, 70, 60 (a drop); Ben: never submits (three auto Missing).
const row = (
  sessionId: string,
  n: number,
  uid: string,
  points: number | null
): GradeIndexRow => ({
  kind: 'quiz',
  sessionId,
  studentUid: uid,
  ownerUid: 't',
  editorUids: [],
  rosterIds: ['r1'],
  classIds: ['c1'],
  title: `Quiz ${n}`,
  rawPct: points === null ? null : points * 10,
  points,
  max: 10,
  state: points === null ? 'not-attempted' : 'scored',
  submittedAt: points === null ? null : NOW - 10_000 + n,
  dueAt: NOW - 5_000 + n,
  openAt: null,
  closeAt: null,
  createdAt: n,
  attempts: [],
  targetEvidence:
    points === null
      ? []
      : [
          {
            targetId: 'std:RL.1',
            kind: 'standard',
            earned: points,
            possible: 10,
          },
        ],
  published: true,
  assigned: true,
  updatedAt: 1,
});

function setup() {
  const source: GradebookSource = {
    status: 'ready',
    rows: [
      row('q1', 1, 'u1', 9),
      row('q2', 2, 'u1', 7),
      row('q3', 3, 'u1', 6),
      row('q1', 1, 'u2', null),
      row('q2', 2, 'u2', null),
      row('q3', 3, 'u2', null),
    ],
    marks: [],
    columnConfigs: [],
    classState: null,
    settings: DEFAULT_GRADEBOOK_SETTINGS,
    scale: DEFAULT_PROFICIENCY_SCALE,
    periods: [],
    saveMarks: vi.fn(() => Promise.resolve()),
    saveColumn: vi.fn(() => Promise.resolve()),
    saveClassState: vi.fn(() => Promise.resolve()),
  };
  render(
    <GradebookProvider
      uid="t"
      source={source}
      roster={roster}
      rosters={[roster]}
      studentByUid={
        new Map([
          ['u1', students[0]],
          ['u2', students[1]],
        ])
      }
      toast={vi.fn()}
      now={NOW}
    >
      <GradebookAnalysis />
    </GradebookProvider>
  );
}

const card = (title: string) =>
  screen
    .getByRole('heading', { name: title })
    .closest('section') as HTMLElement;

describe('GradebookAnalysis', () => {
  it('shows the class numbers, insights and missing work', () => {
    setup();
    expect(screen.getByText('2 students · 3 assignments')).toBeTruthy();
    expect(screen.getByText('Missing items').previousSibling?.textContent).toBe(
      '3'
    );
    const attention = card('Needs attention');
    expect(
      within(attention).getByText(
        'Ruiz, Ana dropped 30 points over the last 3 assessments'
      )
    ).toBeTruthy();
    expect(
      within(attention).getByText('Adams, Ben has 3 missing assignments')
    ).toBeTruthy();
    expect(
      within(card('Missing work')).getByText('Quiz 1, Quiz 2, Quiz 3')
    ).toBeTruthy();
  });

  it('opens the student from an insight', () => {
    nav.mockClear();
    setup();
    fireEvent.click(screen.getByText('Adams, Ben has 3 missing assignments'));
    expect(nav).toHaveBeenCalledWith('/gradebook/r1/student/u2');
  });

  it('filters by roster group and counts the filter', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    fireEvent.change(screen.getByLabelText('Roster group'), {
      target: { value: 'g1' },
    });
    expect(screen.getByText('1 students · 3 assignments')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Filters/ }).textContent
    ).toContain('1');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('2 students · 3 assignments')).toBeTruthy();
  });

  it('opens the Analyze modal from an assignment average', () => {
    setup();
    fireEvent.click(
      within(card('Assignment averages')).getByRole('button', {
        name: 'Quiz 1',
      })
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('1/2')).toBeTruthy();
    expect(within(dialog).getByText('Adams, Ben')).toBeTruthy();
    expect(
      within(dialog).getByText('No question data for this activity.')
    ).toBeTruthy();
  });
});
