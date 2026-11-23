import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PeriodAccess, QuizAssignment } from '@/types';
import {
  deriveAssignedStatus,
  quizAssignedInput,
} from '@/utils/assignedStatus';
import { AssignedRow } from './AssignedRow';
import { mainActionLabel } from './assignedWording';

const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/hooks/useShowPickedStudents', () => ({
  useShowPickedStudents: () => flag.on,
}));

const NOW = Date.UTC(2026, 10, 18, 16, 0);
const ready = (label: string): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
});
const derive = (over: Partial<QuizAssignment>) =>
  deriveAssignedStatus(
    quizAssignedInput(
      {
        id: 'a1',
        quizId: 'q1',
        quizTitle: 'Cells quiz',
        quizDriveFileId: 'f1',
        teacherUid: 't1',
        code: 'ABC',
        status: 'active',
        createdAt: 100,
        updatedAt: 100,
        sessionMode: 'student',
        sessionOptions: {},
        ...over,
      },
      { responses: [], needsGrading: 0 }
    ),
    NOW
  );

const renderRow = (
  status: ReturnType<typeof derive>,
  onResults = vi.fn(),
  extra: Partial<React.ComponentProps<typeof AssignedRow>> = {}
) =>
  render(
    <AssignedRow
      title="Cells quiz"
      status={status}
      nowMs={NOW}
      mainLabel={mainActionLabel(status.action, 0)}
      onMain={vi.fn()}
      onClassAction={vi.fn()}
      onResults={onResults}
      menuActions={[]}
      tourIndex={0}
      tourWidgetType="quiz"
      {...extra}
    />
  );

describe('AssignedRow', () => {
  it('shows no main button while several classes are Ready', async () => {
    const status = derive({
      status: 'paused',
      periodAccess: { P1: ready('P1'), P2: ready('P2') },
    });
    expect(status.action.kind).toBe('choose-class');
    renderRow(status);
    expect(screen.queryByRole('button', { name: 'Choose class' })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Details for Cells quiz' })
    );
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(2);
  });

  it('shows Results once on a Finished row', async () => {
    const status = derive({ status: 'inactive' });
    expect(status.action.kind).toBe('results');
    renderRow(status);
    await userEvent.click(
      screen.getByRole('button', { name: 'Details for Cells quiz' })
    );
    expect(screen.getAllByRole('button', { name: 'Results' })).toHaveLength(1);
  });

  it('names picked students under their class, then any outside it', async () => {
    const periodAccess = {
      P1: { ...ready('Period 1'), rosterId: 'r1' },
      P2: { ...ready('Period 2'), rosterId: 'r2' },
    };
    const status = derive({ status: 'paused', periodAccess });
    renderRow(status, vi.fn(), {
      periodAccess,
      picked: {
        count: 4,
        classes: [
          {
            rosterId: 'r1',
            label: 'Period 1',
            names: ['Adams, Ava', 'Diaz, Ben'],
          },
          { rosterId: 'r9', label: 'Period 9', names: ['Kim, Ivy'] },
        ],
        elsewhere: ['Evans, Eli'],
        unnamed: 1,
      },
    });
    expect(screen.getByText('4 students')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Details for Cells quiz' })
    );
    expect(screen.getByText('Adams, Ava · Diaz, Ben')).toBeTruthy();
    expect(screen.getByText('Period 9')).toBeTruthy();
    expect(screen.getByText('Kim, Ivy')).toBeTruthy();
    expect(screen.getByText('Not in these classes')).toBeTruthy();
    expect(screen.getByText('Evans, Eli')).toBeTruthy();
    expect(screen.getByText('1 student not on your class lists')).toBeTruthy();
  });

  it('hides picked names while the preview flag is off', () => {
    flag.on = false;
    const status = derive({ status: 'paused' });
    renderRow(status, vi.fn(), {
      picked: { count: 2, classes: [], elsewhere: [], unnamed: 2 },
    });
    expect(screen.queryByText('2 students')).toBeNull();
    flag.on = true;
  });
});
