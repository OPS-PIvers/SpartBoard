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

const renderRow = (status: ReturnType<typeof derive>, onResults = vi.fn()) =>
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
});
