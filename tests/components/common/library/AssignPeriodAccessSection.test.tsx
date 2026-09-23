import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AssignTargetingSection,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/components/common/library/AssignTargetingSection';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import type { ClassRoster } from '@/types';

const makeRoster = (over: Partial<ClassRoster>): ClassRoster => ({
  id: 'r',
  name: 'Period',
  driveFileId: null,
  studentCount: 0,
  createdAt: 0,
  students: [],
  ...over,
});

const p1 = makeRoster({
  id: 'r1',
  name: 'P1 Algebra',
  classlinkClassId: 'cl-1',
  bellPeriod: { buildingId: 'high', periodId: 'P1' },
});
const p3 = makeRoster({ id: 'r3', name: 'P3 Local' });

const context = (
  over: Partial<AssignPeriodAccessContext> = {}
): AssignPeriodAccessContext => ({
  bellOptions: [
    { buildingId: 'high', periodId: 'P1', label: 'Period 1' },
    { buildingId: 'high', periodId: 'P3', label: 'Period 3' },
  ],
  bellWindow: () => ({
    openAt: new Date(2026, 8, 29, 10, 40).getTime(),
    closeAt: new Date(2026, 8, 29, 11, 30).getTime(),
  }),
  onTagRoster: vi.fn(),
  ...over,
});

const renderSection = (
  value: AssignTargetingValue = EMPTY_ASSIGN_TARGETING_VALUE,
  selectedRosterIds = ['r1', 'r3'],
  periodAccess: AssignPeriodAccessContext | null = context()
) => {
  const onChange = vi.fn();
  render(
    <AssignTargetingSection
      rosters={[p1, p3]}
      selectedRosterIds={selectedRosterIds}
      value={value}
      onChange={onChange}
      kind="quiz"
      periodAccess={periodAccess ?? undefined}
    />
  );
  return onChange;
};

describe('AssignPeriodAccessSection', () => {
  it('shows only when the flag context is given and two classes are checked', () => {
    renderSection(EMPTY_ASSIGN_TARGETING_VALUE, ['r1']);
    expect(screen.queryByText('Class periods')).not.toBeInTheDocument();
  });

  it('is absent without the flag context', () => {
    renderSection(EMPTY_ASSIGN_TARGETING_VALUE, ['r1', 'r3'], null);
    expect(screen.queryByText('Class periods')).not.toBeInTheDocument();
  });

  it('defaults to Assignment and switches to In-class assessment', () => {
    const onChange = renderSection();
    expect(screen.getByRole('radio', { name: 'Assignment' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: 'In-class assessment' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ periodPlan: { mode: 'assessment' } })
    );
  });

  it('flags an unverified class and asks for an untagged period in assessment mode', () => {
    const tag = vi.fn();
    renderSection(
      { ...EMPTY_ASSIGN_TARGETING_VALUE, periodPlan: { mode: 'assessment' } },
      ['r1', 'r3'],
      context({ onTagRoster: tag })
    );
    expect(screen.getByText(/PIN only, not verified/)).toBeInTheDocument();
    expect(screen.queryByText('P1 Algebra')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Which period is P3 Local/), {
      target: { value: 'high|P3' },
    });
    expect(tag).toHaveBeenCalledWith('r3', {
      buildingId: 'high',
      periodId: 'P3',
    });
  });

  it('shows a tagged period’s bell times once Bell times is picked', () => {
    renderSection({
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      periodPlan: { mode: 'assignment', rows: { r1: { source: 'bell' } } },
    });
    expect(screen.getByText(/10:40/)).toBeInTheDocument();
    expect(screen.getByLabelText('Window for P1 Algebra')).toHaveValue('bell');
  });

  it('records a per-period window source', () => {
    const onChange = renderSection();
    fireEvent.click(screen.getByText('Customize per period'));
    fireEvent.change(screen.getByLabelText('Window for P3 Local'), {
      target: { value: 'custom' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        periodPlan: { mode: 'assignment', rows: { r3: { source: 'custom' } } },
      })
    );
  });
});
