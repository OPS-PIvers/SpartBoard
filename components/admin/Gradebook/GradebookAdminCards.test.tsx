import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GradingPeriodSetsCard } from './GradingPeriodSetsCard';
import { DistrictConfigsCard } from './DistrictConfigsCard';
import { DistrictScaleCard } from './DistrictScaleCard';
import {
  DEFAULT_PROFICIENCY_SCALE,
  type GradingPeriod,
} from '@/utils/gradebook/gradebookCore';
import { parseDistrictConfig } from '@/utils/gradebook/settingsConfig';
import type { GradingPeriodSet } from '@/utils/gradebook/gradingPeriods';
import type { UndoEntry } from '@/components/gradebook/settings/useUndoToast';

const buildings = [
  { id: 'middle', name: 'Middle School' },
  { id: 'high', name: 'High School' },
];
const set = (
  id: string,
  name: string,
  buildingIds: string[],
  periods: GradingPeriod[] = []
): GradingPeriodSet => ({
  id,
  name,
  orgId: 'orono',
  buildingIds,
  periods,
  updatedAt: 0,
});
const handlers = () => ({
  onSave: vi.fn((_id: string, _v: unknown) => Promise.resolve()),
  onDelete: vi.fn(() => Promise.resolve()),
  notify: vi.fn((_m: string, _u?: UndoEntry) => undefined),
  fail: vi.fn(),
});

describe('GradingPeriodSetsCard', () => {
  it('moves a building from another set with one undo', async () => {
    const h = handlers();
    render(
      <GradingPeriodSetsCard
        sets={[set('a', 'Quarters', ['middle']), set('b', 'Semesters', [])]}
        buildings={buildings}
        newId={() => 'n'}
        {...h}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Buildings using Semesters' })
    );
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: /Middle School/ })
    );
    expect(h.onSave).toHaveBeenCalledWith('b', {
      name: 'Semesters',
      buildingIds: ['middle'],
      periods: [],
    });
    expect(h.onSave).toHaveBeenCalledWith('a', {
      name: 'Quarters',
      buildingIds: [],
      periods: [],
    });
    const [message, undo] = h.notify.mock.calls[0];
    expect(message).toBe('Moved Middle School from Quarters to Semesters');
    h.onSave.mockClear();
    await undo?.run();
    expect(h.onSave).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ buildingIds: ['middle'] })
    );
    expect(h.onSave).toHaveBeenCalledWith(
      'b',
      expect.objectContaining({ buildingIds: [] })
    );
  });

  it('fills quarters and refuses an end before the start', () => {
    const h = handlers();
    const { rerender } = render(
      <GradingPeriodSetsCard
        sets={[set('a', 'Quarters', [])]}
        buildings={buildings}
        newId={() => 'n'}
        {...h}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Quarters' }));
    const saved = h.onSave.mock.calls[0][1] as { periods: GradingPeriod[] };
    expect(saved.periods.map((p) => p.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);

    rerender(
      <GradingPeriodSetsCard
        sets={[
          set(
            'a',
            'Quarters',
            [],
            [{ id: 'q1', label: 'Q1', start: '2026-09-02', end: '2026-11-06' }]
          ),
        ]}
        buildings={buildings}
        newId={() => 'n'}
        {...h}
      />
    );
    h.onSave.mockClear();
    const end = screen.getByLabelText('Q1 end date');
    fireEvent.change(end, { target: { value: '2026-08-01' } });
    fireEvent.blur(end);
    expect(h.onSave).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenLastCalledWith(
      'The end date is before the start date.'
    );
  });
});

describe('DistrictConfigsCard', () => {
  it('drops the default from an overlapping configuration', () => {
    const h = handlers();
    const a = parseDistrictConfig('a', {
      name: 'OMS',
      buildingIds: ['middle'],
      isDefault: true,
    });
    const b = parseDistrictConfig('b', {
      name: 'OMS Honors',
      buildingIds: ['middle'],
      isDefault: false,
    });
    render(
      <DistrictConfigsCard
        configs={[b, a]}
        buildings={buildings}
        scaleOptions={[
          { value: 'district', label: 'District scale', scale: null },
        ]}
        newId={() => 'n'}
        {...h}
      />
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Default for new classes' })
    );
    expect(h.onSave).toHaveBeenCalledWith(
      'b',
      expect.objectContaining({ isDefault: true })
    );
    expect(h.onSave).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ isDefault: false })
    );
  });

  it('shows an empty state with New', () => {
    const h = handlers();
    render(
      <DistrictConfigsCard
        configs={[]}
        buildings={buildings}
        scaleOptions={[]}
        newId={() => 'n1'}
        {...h}
      />
    );
    expect(screen.getByText('No district configurations')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(h.onSave).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ buildingIds: [], isDefault: false })
    );
  });
});

describe('DistrictScaleCard', () => {
  it('keeps the middle cutoff below the top one', () => {
    const h = handlers();
    render(
      <DistrictScaleCard
        title="Orono district scale"
        scale={DEFAULT_PROFICIENCY_SCALE}
        onSave={(scale) => h.onSave('scale', scale)}
        notify={h.notify}
        fail={h.fail}
      />
    );
    const top = screen.getByLabelText('Proficient cutoff');
    fireEvent.change(top, { target: { value: '50' } });
    fireEvent.blur(top);
    expect(h.onSave).toHaveBeenCalledWith(
      'scale',
      expect.objectContaining({ proficient: 50, approaching: 49 })
    );
  });
});
