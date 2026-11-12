import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import type { ClassRoster } from '@/types';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import { AssignWhenStep } from './AssignWhenStep';
import {
  defaultWhenValue,
  formatWhenValue,
  type AssignWhenValue,
  type AssignWhenVariant,
} from './assignWhenValue';

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

const BELL: AssignWhenValue = {
  mode: 'scheduled',
  availability: {
    all: {
      opens: { day: '2026-10-08', time: 'bell' },
      closes: { day: '2026-10-08', time: 'bell' },
    },
    allowLate: false,
  },
};

const t = i18n.t.bind(i18n);
const fmt = (
  value: AssignWhenValue,
  variant: AssignWhenVariant = 'when',
  rosterCount = 1,
  manualAvailable = true
) => formatWhenValue(value, { variant, rosterCount, manualAvailable, t });

const Harness: React.FC<{
  initial?: AssignWhenValue;
  variant?: AssignWhenVariant;
  rosters?: ClassRoster[];
  noBells?: boolean;
  onValue?: (v: AssignWhenValue) => void;
}> = ({
  initial = BELL,
  variant = 'when',
  rosters = [roster(1)],
  noBells,
  onValue,
}) => {
  const [value, setValue] = useState(initial);
  return (
    <AssignWhenStep
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      variant={variant}
      rosters={rosters}
      periodAccess={noBells ? undefined : CTX}
    />
  );
};

describe('defaultWhenValue', () => {
  const now = new Date(2026, 9, 8, 10, 0);

  it('starts Quiz on Manual when bell periods exist', () => {
    expect(
      defaultWhenValue({
        activity: 'quiz',
        now,
        bellAvailable: true,
        manualAvailable: true,
      }).mode
    ).toBe('manual');
  });

  it('falls back to Scheduled without bell periods, and for other activities', () => {
    expect(
      defaultWhenValue({
        activity: 'quiz',
        now,
        bellAvailable: false,
        manualAvailable: false,
      }).mode
    ).toBe('scheduled');
    expect(
      defaultWhenValue({
        activity: 'gl',
        now,
        bellAvailable: true,
        manualAvailable: true,
      }).mode
    ).toBe('scheduled');
  });

  it('opens a study resource now and keeps it until the teacher ends it', () => {
    const { availability } = defaultWhenValue({
      activity: 'flashcards',
      now,
      bellAvailable: true,
      manualAvailable: true,
    });
    expect(availability.opensNow).toBe(true);
    expect(availability.noEnd).toBe(true);
  });
});

describe('formatWhenValue', () => {
  it('reads Manual as the state line', () => {
    expect(fmt({ ...BELL, mode: 'manual' })).toBe(
      'Manual. You start and pause each class.'
    );
  });

  it('reads a stale Manual as the dates when Manual is unavailable', () => {
    expect(fmt({ ...BELL, mode: 'manual' }, 'when', 1, false)).toBe(
      'Open Oct 8, start of class to Oct 8, end of class'
    );
  });

  it('reads bell and set times', () => {
    expect(fmt(BELL)).toBe('Open Oct 8, start of class to Oct 8, end of class');
    expect(
      fmt({
        ...BELL,
        availability: {
          ...BELL.availability,
          all: {
            opens: { day: '2026-10-08', time: '08:00' },
            closes: { day: '2026-10-10', time: '15:00' },
          },
        },
      })
    ).toMatch(/^Open Oct 8, 8:00\sAM to Oct 10, 3:00\sPM$/);
  });

  it('reads Available for a study resource', () => {
    expect(fmt(BELL, 'available')).toBe(
      'Available Oct 8, start of class to Oct 8, end of class'
    );
  });

  it('reads Now and You end it for a study resource', () => {
    const at = (opensNow: boolean, noEnd: boolean): AssignWhenValue => ({
      ...BELL,
      availability: { ...BELL.availability, opensNow, noEnd },
    });
    expect(fmt(at(true, true), 'available')).toBe(
      'Available now until you end it'
    );
    expect(fmt(at(true, false), 'available')).toBe(
      'Available now until Oct 8, end of class'
    );
    expect(fmt(at(false, true), 'available')).toBe(
      'Available Oct 8, start of class until you end it'
    );
    expect(fmt(at(true, true), 'when')).toMatch(/^Open Oct 8/);
  });

  it('reads per-class dates only with two or more classes', () => {
    const each: AssignWhenValue = {
      ...BELL,
      availability: { ...BELL.availability, byRoster: {} },
    };
    expect(fmt(each, 'when', 2)).toBe('Open on different dates for each class');
    expect(fmt(each, 'available', 2)).toBe(
      'Available on different dates for each class'
    );
    expect(fmt(each, 'when', 1)).toMatch(/^Open Oct 8/);
  });

  it('reads live as started from the board', () => {
    expect(fmt(BELL, 'live')).toBe('You start it from the board');
  });
});

describe('AssignWhenStep', () => {
  it('switches to Manual and shows only the state line', () => {
    const onValue = vi.fn<(v: AssignWhenValue) => void>();
    render(<Harness onValue={onValue} />);
    expect(screen.getByLabelText('Opens')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Manual' }));
    expect(onValue).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'manual' })
    );
    expect(
      screen.getByText('Starts paused. You start and pause each class.')
    ).toBeTruthy();
    expect(screen.queryByLabelText('Opens')).toBeNull();
    expect(screen.queryByText('Allow submissions after close')).toBeNull();
  });

  it('hides Manual without bell periods', () => {
    render(<Harness initial={{ ...BELL, mode: 'manual' }} noBells />);
    expect(screen.queryByRole('radio', { name: 'Manual' })).toBeNull();
    expect(screen.getByLabelText('Opens')).toBeTruthy();
  });

  it('expands per-class rows from the link and collapses them back', () => {
    const onValue = vi.fn<(v: AssignWhenValue) => void>();
    render(<Harness rosters={[roster(1), roster(2)]} onValue={onValue} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Different time for each class' })
    );
    expect(screen.getByText('Period 1')).toBeTruthy();
    expect(screen.getByText('Period 2')).toBeTruthy();
    expect(onValue.mock.lastCall?.[0].availability.byRoster).toEqual({
      r1: BELL.availability.all,
      r2: BELL.availability.all,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Same time for all classes' })
    );
    expect(onValue.mock.lastCall?.[0].availability.byRoster).toBeUndefined();
  });

  it('has no per-class link with one class', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: 'Different time for each class' })
    ).toBeNull();
  });

  it('has no per-class link without bell periods, since no period gate can save it', () => {
    render(<Harness rosters={[roster(1), roster(2)]} noBells />);
    expect(
      screen.queryByRole('button', { name: 'Different time for each class' })
    ).toBeNull();
  });

  it('keeps the per-class link without bell periods when the host opts in', () => {
    render(
      <AssignWhenStep
        value={BELL}
        onChange={vi.fn()}
        variant="when"
        rosters={[roster(1), roster(2)]}
        perClass
      />
    );
    expect(
      screen.getByRole('button', { name: 'Different time for each class' })
    ).toBeTruthy();
  });

  it('toggles late work', () => {
    const onValue = vi.fn<(v: AssignWhenValue) => void>();
    render(<Harness onValue={onValue} />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Allow submissions after close' })
    );
    expect(onValue.mock.lastCall?.[0].availability.allowLate).toBe(true);
  });

  it('shows Opens and Available until with no Manual or late work for a study resource', () => {
    render(<Harness variant="available" />);
    expect(screen.getByLabelText('Opens')).toBeTruthy();
    expect(screen.getByLabelText('Available until')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Manual' })).toBeNull();
    expect(screen.queryByText('Allow submissions after close')).toBeNull();
  });

  it('switches a study resource between Now / You end it and dates', () => {
    const onValue = vi.fn<(v: AssignWhenValue) => void>();
    render(
      <Harness
        variant="available"
        initial={{
          ...BELL,
          availability: { ...BELL.availability, opensNow: true, noEnd: true },
        }}
        onValue={onValue}
      />
    );
    const opens = screen.getByLabelText('Opens');
    expect((opens as HTMLSelectElement).value).toBe('open');
    expect(screen.getByRole('option', { name: 'Now' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'You end it' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Available until'), {
      target: { value: 'date' },
    });
    expect(onValue.mock.lastCall?.[0].availability).toMatchObject({
      opensNow: true,
      noEnd: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'You end it' }));
    expect(onValue.mock.lastCall?.[0].availability.noEnd).toBe(true);
  });

  it('keeps dates without Now for collected work', () => {
    render(
      <Harness
        initial={{
          ...BELL,
          availability: { ...BELL.availability, opensNow: true, noEnd: true },
        }}
      />
    );
    expect(screen.queryByRole('option', { name: 'Now' })).toBeNull();
    expect(screen.getByLabelText('Closes')).toBeTruthy();
  });

  it('shows only the live state line', () => {
    render(<Harness variant="live" />);
    expect(
      screen.getByText('Starts paused. You start it from the board.')
    ).toBeTruthy();
    expect(screen.queryByLabelText('Opens')).toBeNull();
  });
});
