import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ClassRoster } from '@/types';
import type { AssignAvailability } from '@/utils/assignAvailability';
import { AssignAvailabilitySection } from './AssignAvailabilitySection';
import type { AssignPeriodAccessContext } from './AssignPeriodAccessSection';

const roster = (n: number): ClassRoster => ({
  id: `r${n}`,
  name: `Period ${n}`,
  driveFileId: null,
  studentCount: 0,
  createdAt: 0,
  students: [],
  bellPeriod: { buildingId: 'b', periodId: String(n) },
});

const CTX: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: () => null,
  onTagRoster: vi.fn(),
};

const START: AssignAvailability = {
  all: {
    opens: { day: '2026-10-02', time: 'bell' },
    closes: { day: '2026-10-02', time: 'bell' },
  },
  allowLate: false,
};

const Harness: React.FC<{
  rosters: ClassRoster[];
  onValue: (v: AssignAvailability) => void;
}> = ({ rosters, onValue }) => {
  const [value, setValue] = useState(START);
  return (
    <AssignAvailabilitySection
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
      rosters={rosters}
      periodAccess={CTX}
    />
  );
};

describe('AssignAvailabilitySection', () => {
  it('switches a bell time to a set time and back', () => {
    const onValue = vi.fn<(v: AssignAvailability) => void>();
    render(<Harness rosters={[roster(3)]} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText('Opens time'), {
      target: { value: 'time' },
    });
    expect(onValue.mock.lastCall?.[0].all.opens).toEqual({
      day: '2026-10-02',
      time: '08:00',
    });
    expect(screen.getByLabelText('Opens time')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Start of class' }));
    expect(onValue.mock.lastCall?.[0].all.opens.time).toBe('bell');
  });

  it('offers per-class dates only with two or more classes', () => {
    const onValue = vi.fn<(v: AssignAvailability) => void>();
    const { rerender } = render(
      <Harness rosters={[roster(3)]} onValue={onValue} />
    );
    expect(screen.queryByLabelText('Dates for')).toBeNull();
    rerender(<Harness rosters={[roster(3), roster(5)]} onValue={onValue} />);
    fireEvent.change(screen.getByLabelText('Dates for'), {
      target: { value: 'each' },
    });
    expect(Object.keys(onValue.mock.lastCall?.[0].byRoster ?? {})).toEqual([
      'r3',
      'r5',
    ]);
    expect(screen.getByText('Period 5')).toBeInTheDocument();
  });

  it('only offers a set time without bells', () => {
    render(
      <AssignAvailabilitySection
        value={START}
        onChange={vi.fn()}
        rosters={[]}
      />
    );
    expect(screen.queryByRole('button', { name: 'Start of class' })).toBeNull();
    expect(screen.getByLabelText('Opens time')).toHaveValue('00:00');
  });

  it('warns when the close comes before the open', () => {
    render(
      <AssignAvailabilitySection
        value={{
          ...START,
          all: {
            opens: { day: '2026-10-02', time: '15:00' },
            closes: { day: '2026-10-02', time: '09:00' },
          },
        }}
        onChange={vi.fn()}
        rosters={[]}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Closes before it opens.'
    );
  });

  it('toggles late work', () => {
    const onValue = vi.fn<(v: AssignAvailability) => void>();
    render(<Harness rosters={[roster(3)]} onValue={onValue} />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Allow submissions after close' })
    );
    expect(onValue.mock.lastCall?.[0].allowLate).toBe(true);
  });
});
