import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ClassRoster, PeriodAccess } from '@/types';
import { ClassChecklist } from './ClassChecklist';
import { AssignStepper } from './AssignStepper';
import { useAssignOpenCheck } from './assignOpenCheck';
import type { AssignClassesValue } from './assignClassesValue';
import type { OpenAssignmentInput } from '@/utils/openAssignmentClasses';

const ROSTERS: ClassRoster[] = ['Period 1', 'Period 2', 'Period 3'].map(
  (name, i) => ({
    id: `r${i + 1}`,
    name,
    driveFileId: null,
    studentCount: 20,
    createdAt: 0,
    students: [],
  })
);
const OPEN: OpenAssignmentInput[] = [
  {
    id: 'a1',
    live: true,
    createdAt: 1,
    rosterIds: ['r2'],
    canAddClasses: true,
  },
];

const Harness = ({
  initial = [] as string[],
  students = {} as AssignClassesValue['studentsByClass'],
  open = OPEN,
  onAdd = vi.fn<(id: string, ids: string[]) => void>(),
  onSubmit = vi.fn<() => void>(),
}) => {
  const [classes, setClasses] = useState<AssignClassesValue>({
    classIds: initial,
    studentsByClass: students,
  });
  const check = useAssignOpenCheck(open, ROSTERS, classes);
  return (
    <AssignStepper
      isOpen
      onClose={() => undefined}
      title="Quiz A"
      submitLabel="Assign"
      joining={check.joining}
      disabled={check.pickedOpen}
      onSubmit={() =>
        check.joinTarget
          ? onAdd(check.joinTarget.id, check.classIds)
          : onSubmit()
      }
      steps={[
        {
          id: 'classes',
          title: 'Classes',
          value: '',
          body: (
            <ClassChecklist
              rosters={ROSTERS}
              value={classes}
              onChange={setClasses}
              open={check.checklist}
            />
          ),
        },
        { id: 'when', title: 'When', value: 'Now', body: <p>when body</p> },
      ]}
    />
  );
};

describe('Assign open-class check', () => {
  it('locks a class the item is open for and names it', () => {
    render(<Harness />);
    const locked = screen.getByRole('checkbox', { name: /Period 2/ });
    expect(locked).toBeDisabled();
    expect(locked).not.toBeChecked();
    expect(
      screen.getByText(
        'Already assigned to Period 2. Edit or close it in Assigned.'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('checkbox', { name: /Period 1/ })).toBeChecked();
    expect(locked).not.toBeChecked();
  });

  it('adds a new class to the open assignment by default', () => {
    const onAdd = vi.fn();
    render(<Harness initial={['r3']} onAdd={onAdd} />);
    expect(
      screen.getByRole('radio', { name: /Add to the Period 2 assignment/ })
    ).toBeChecked();
    expect(screen.getByText('Kept as is')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add to assignment/ }));
    expect(onAdd).toHaveBeenCalledWith('a1', ['r3']);
  });

  it('makes a separate assignment when picked', () => {
    const onAdd = vi.fn();
    const onSubmit = vi.fn();
    render(<Harness initial={['r3']} onAdd={onAdd} onSubmit={onSubmit} />);
    fireEvent.click(
      screen.getByRole('radio', { name: /Make a separate assignment/ })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Assign$/ }));
    expect(onSubmit).toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('blocks Assign when an open class is still in the picks', () => {
    render(<Harness initial={['r2']} />);
    expect(screen.getByRole('button', { name: /^Assign$/ })).toBeDisabled();
  });

  it('offers no join when a pick is already on the open copy', () => {
    const closedP1: OpenAssignmentInput = {
      ...OPEN[0],
      rosterIds: ['r1', 'r2'],
      periodAccess: {
        k1: { state: 'closed', closedAt: 1, rosterId: 'r1' } as PeriodAccess,
      },
    };
    render(<Harness initial={['r1', 'r3']} open={[closedP1]} />);
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('offers no join when students are picked', () => {
    render(
      <Harness
        initial={['r3']}
        students={{ r3: [{ kind: 'classlink', sourcedId: 's1' }] }}
      />
    );
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: /^Assign$/ })).toBeEnabled();
  });

  it('lets an open class picked by a prefill be unchecked', () => {
    render(<Harness initial={['r2']} />);
    const row = screen.getByRole('checkbox', { name: /Period 2/ });
    expect(row).toBeChecked();
    fireEvent.click(row);
    expect(row).not.toBeChecked();
    expect(row).toBeDisabled();
  });
});
