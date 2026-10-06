import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClassRoster, Student } from '@/types';
import {
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  type GradeIndexRow,
} from '@/utils/gradebook/gradebookCore';
import type { GradebookSource } from '@/hooks/useGradebookSource';
import { GradebookProvider } from './GradebookProvider';
import { GradebookGrid } from './GradebookGrid';
import { GradebookSubBar } from './GradebookSubBar';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => false }),
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
  submittedAt: points === null ? null : NOW - 300_000,
  dueAt: NOW - 200_000,
  openAt: null,
  closeAt: null,
  createdAt: 0,
  attempts: [],
  targetEvidence: [],
  published: true,
  assigned: true,
  updatedAt: 1,
});

function setup(withSubBar = false) {
  const saveMarks = vi.fn<GradebookSource['saveMarks']>(() =>
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
    saveMarks,
    saveColumn: vi.fn(() => Promise.resolve()),
    saveClassState: vi.fn(() => Promise.resolve()),
  };
  const toast = vi.fn();
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
      toast={toast}
      now={NOW}
    >
      {withSubBar && <GradebookSubBar onGrid />}
      <GradebookGrid />
    </GradebookProvider>
  );
  return { saveMarks, toast };
}

describe('GradebookGrid', () => {
  it('sorts by last name, shows auto Missing as a zero and counts it', () => {
    setup();
    const names = screen.getAllByRole('rowheader').map((th) => th.textContent);
    expect(names[0]).toContain('Adams, Ben');
    expect(names[0]).toContain('1 missing');
    expect(names[1]).toContain('Ruiz, Ana');
    expect(screen.getByLabelText('Adams, Ben, Unit quiz: 0%')).toBeTruthy();
    expect(screen.getByLabelText('Ruiz, Ana, Unit quiz: 80%')).toBeTruthy();
  });

  it('keeps sorting by last name when names switch to First Last', () => {
    setup(true);
    fireEvent.click(screen.getByRole('button', { name: /^View/ }));
    fireEvent.change(screen.getByLabelText('Names'), {
      target: { value: 'first-last' },
    });
    const names = screen.getAllByRole('rowheader').map((th) => th.textContent);
    expect(names[0]).toContain('Ben Adams');
    expect(names[1]).toContain('Ana Ruiz');
  });

  it('toggles a flag from the keyboard with history, then undoes it', async () => {
    const { saveMarks, toast } = setup();
    const cell = screen.getByLabelText('Ruiz, Ana, Unit quiz: 80%');
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: 'l' });
    await waitFor(() => expect(saveMarks).toHaveBeenCalled());
    expect(saveMarks).toHaveBeenCalledTimes(1);
    const [saves, batchId] = saveMarks.mock.calls[0];
    expect(batchId).toBeNull();
    expect(saves[0].mark).toMatchObject({
      sessionId: 'q1',
      studentUid: 'u1',
      ownerUid: 't',
      rosterIds: ['r1'],
      flags: ['late'],
    });
    expect(saves[0].history).toEqual([
      expect.objectContaining({
        field: 'flags',
        before: { flags: [] },
        after: { flags: ['late'] },
      }),
    ]);
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      'Marked Late for Ana',
      expect.any(Function)
    );

    await act(async () => {
      await (toast.mock.calls[0][1] as () => Promise<void>)();
    });
    expect(saveMarks).toHaveBeenCalledTimes(2);
    expect(saveMarks.mock.calls[1][0][0].mark.flags).toEqual([]);
  });

  it('clears an automatic flag by suppressing it', async () => {
    const { saveMarks } = setup();
    const cell = screen.getByLabelText('Adams, Ben, Unit quiz: 0%');
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: 'M' });
    await waitFor(() => expect(saveMarks).toHaveBeenCalled());
    expect(saveMarks.mock.calls[0][0][0].mark).toMatchObject({
      flags: [],
      suppressedAuto: ['missing'],
    });
  });
});
