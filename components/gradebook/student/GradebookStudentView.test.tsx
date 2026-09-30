import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClassRoster, Student } from '@/types';
import {
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  type GradeIndexRow,
} from '@/utils/gradebook/gradebookCore';
import type { GradebookSource } from '@/hooks/useGradebookSource';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import { GradebookProvider } from '../GradebookProvider';
import { GradebookStudentView } from './GradebookStudentView';

vi.mock('@/components/gradebook/charts/LazyCharts', () => ({
  ScoreTrendChart: () => <div data-testid="trend" />,
  ScoreHistogram: () => null,
}));

const NOW = new Date(2026, 9, 1).getTime();
const students: Student[] = [
  { id: 's1', firstName: 'Ana', lastName: 'Ruiz', pin: '1' },
  { id: 's2', firstName: 'Ben', lastName: 'Adams', pin: '2' },
];
const roster: ClassRoster = {
  id: 'r1',
  name: 'Period 1',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  classlinkClassId: 'c1',
  students,
};
const row = (uid: string, points: number | null): GradeIndexRow => ({
  kind: 'quiz',
  sessionId: 'q1',
  studentUid: uid,
  ownerUid: 't',
  editorUids: [],
  rosterIds: ['r1'],
  classIds: ['c1'],
  title: 'Unit quiz',
  rawPct: points === null ? null : points * 10,
  points,
  max: 10,
  state: points === null ? 'not-attempted' : 'scored',
  submittedAt: points === null ? null : NOW - 1000,
  dueAt: NOW - 500,
  openAt: null,
  closeAt: null,
  createdAt: 0,
  attempts: [],
  targetEvidence:
    points === null
      ? []
      : [{ targetId: 'RL.1', kind: 'standard', earned: 3, possible: 4 }],
  published: true,
  assigned: true,
  updatedAt: 1,
});

function setup(uid: string, auth?: Partial<AuthContextType>) {
  const saveClassState = vi.fn<GradebookSource['saveClassState']>(() =>
    Promise.resolve()
  );
  const source: GradebookSource = {
    status: 'ready',
    rows: [row('u1', 8), row('u2', null)],
    marks: [],
    columnConfigs: [],
    classState: null,
    settings: DEFAULT_GRADEBOOK_SETTINGS,
    scale: DEFAULT_PROFICIENCY_SCALE,
    periods: [],
    saveMarks: vi.fn(() => Promise.resolve()),
    saveColumn: vi.fn(() => Promise.resolve()),
    saveClassState,
  };
  const view = (
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
      <GradebookStudentView studentUid={uid} />
    </GradebookProvider>
  );
  render(
    auth ? (
      <AuthContext.Provider value={auth as AuthContextType}>
        {view}
      </AuthContext.Provider>
    ) : (
      view
    )
  );
  return { saveClassState };
}

describe('GradebookStudentView', () => {
  it('shows the student KPIs, evidence and assignment row', () => {
    setup('u1');
    expect(screen.getByRole('heading', { name: 'Ana Ruiz' })).toBeTruthy();
    expect(screen.getByText('80.0%')).toBeTruthy();
    expect(screen.getByText('Approaching · 75')).toBeTruthy();
    expect(screen.getAllByText('Unit quiz').length).toBeGreaterThan(0);
  });

  it('counts an auto Missing and names it in Needs attention only past the threshold', () => {
    setup('u2');
    expect(screen.getByText('Missing · auto')).toBeTruthy();
    expect(screen.getByText('Nothing needs attention.')).toBeTruthy();
  });

  it('saves the card order and hidden cards for the class', async () => {
    const { saveClassState } = setup('u1');
    fireEvent.click(screen.getByRole('button', { name: 'Customize cards' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Hide' })[1]);
    await waitFor(() => expect(saveClassState).toHaveBeenCalled());
    expect(saveClassState.mock.calls[0][0]).toEqual({
      cardLayouts: {
        student: [
          'performance',
          'habits',
          'standards',
          'compare',
          'insights',
          'assignments',
        ],
        'student-hidden': ['habits'],
      },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    expect(saveClassState.mock.calls[1][0].cardLayouts?.student?.[0]).toBe(
      'habits'
    );
  });

  it('arrow keys change student only while no popover is open', () => {
    setup('u1');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(replace).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockRestore();
  });

  it('previews the student Grades tab when student-gradebook passes', () => {
    setup('u1', { canAccessFeature: () => true });
    fireEvent.click(screen.getByRole('button', { name: 'Preview as student' }));
    expect(screen.getByText('Previewing as Ana Ruiz')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to gradebook' }));
    expect(
      screen.getByRole('button', { name: 'Customize cards' })
    ).toBeTruthy();
  });

  it('hides Preview as student without the flag or an auth provider', () => {
    setup('u1');
    expect(
      screen.queryByRole('button', { name: 'Preview as student' })
    ).toBeNull();
  });
});
