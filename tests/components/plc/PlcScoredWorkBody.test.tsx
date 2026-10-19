import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Plc, PlcScoredWorkAggregate } from '@/types';

const state = {
  aggregates: [] as PlcScoredWorkAggregate[],
  loading: false,
  error: null as Error | null,
};
vi.mock('@/hooks/usePlcScoredWork', () => ({ usePlcScoredWork: () => state }));

import { PlcScoredWorkBody } from '@/components/plc/bodies/PlcScoredWorkBody';

const agg = (
  key: string,
  at: number,
  students: number
): PlcScoredWorkAggregate => ({
  seriesKey: key,
  seriesLabel: key,
  teacherCount: 2,
  studentCount: students,
  averagePercent: 72,
  criteria: [
    { name: 'Thesis', studentCount: students, averagePercent: 60 + at },
    { name: 'Voice', studentCount: students, averagePercent: 90 },
  ],
  scoreDistribution: [],
  firstPublishedAt: at,
  lastPublishedAt: at,
  ranAt: at,
});

const plc = { id: 'p1' } as Plc;

describe('PlcScoredWorkBody', () => {
  it('shows an empty state with the next step', () => {
    state.aggregates = [];
    render(<PlcScoredWorkBody plc={plc} />);
    expect(screen.getByText('No scored work yet')).toBeTruthy();
  });

  it('shows pooled cards and follows a criterion over time', () => {
    state.aggregates = [agg('Unit 2', 20, 60), agg('Unit 1', 10, 3)];
    render(<PlcScoredWorkBody plc={plc} />);
    expect(screen.getByText('Over time')).toBeTruthy();
    expect(screen.getAllByText('Unit 1').length).toBeGreaterThan(0);
    expect(screen.getByText(/Fewer than 5 students/)).toBeTruthy();
    expect(
      screen.getAllByText('Lowest: Thesis at 80%.').length
    ).toBeGreaterThan(0);
  });

  it('reports a load failure instead of an empty state', () => {
    state.aggregates = [];
    state.error = new Error('denied');
    render(<PlcScoredWorkBody plc={plc} />);
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
    state.error = null;
  });
});
