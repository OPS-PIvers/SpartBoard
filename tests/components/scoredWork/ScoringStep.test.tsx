import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ScoredWork } from '@/types';

const saveScore = vi.fn(() => Promise.resolve());
const deleteScore = vi.fn(() => Promise.resolve());

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast: vi.fn(),
    rosters: [
      {
        id: 'r1',
        name: 'Period 1',
        students: [
          { id: 's1', firstName: 'Ann', lastName: 'Lee', pin: '01' },
          { id: 's2', firstName: 'Bo', lastName: 'Kim', pin: '02' },
        ],
      },
    ],
  }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null }),
}));
vi.mock('@/hooks/useScoredWork', () => ({
  useScoredWorkScores: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('@/utils/scoredWorkStore', () => ({
  saveScore: (...args: unknown[]) => saveScore(...(args as [])),
  deleteScore: (...args: unknown[]) => deleteScore(...(args as [])),
  assignSpareSeat: vi.fn(),
}));

import { ScoringStep } from '@/components/scoredWork/ScoringStep';

const level = (id: string, points: number) => ({
  id,
  label: `L${points}`,
  points,
});
const work: ScoredWork = {
  id: 'w1',
  title: 'Essay',
  rubric: {
    id: 'rub',
    title: 'Rubric',
    criteria: [
      { id: 'a', name: 'Thesis', levels: [level('a0', 0), level('a1', 4)] },
      { id: 'b', name: 'Evidence', levels: [level('b0', 1), level('b1', 3)] },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  rosterIds: ['r1'],
  seats: {
    1: { rosterId: 'r1', studentId: 's1' },
    2: { rosterId: 'r1', studentId: 's2' },
  },
  spareSeats: [],
  pageCount: 1,
  createdAt: 0,
  updatedAt: 0,
  scans: { 1: [null] },
};

describe('ScoringStep', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists students by name from the roster', () => {
    render(<ScoringStep work={work} />);
    expect(screen.getAllByText('Lee, Ann').length).toBeGreaterThan(0);
    expect(screen.getByText('Kim, Bo')).toBeTruthy();
  });

  it('saves only once every criterion has a level', () => {
    render(<ScoringStep work={work} />);
    const thesis = screen.getByRole('radiogroup', { name: 'Thesis' });
    fireEvent.click(thesis.querySelectorAll('[role="radio"]')[0]);
    expect(saveScore).not.toHaveBeenCalled();

    const evidence = screen.getByRole('radiogroup', { name: 'Evidence' });
    fireEvent.click(evidence.querySelectorAll('[role="radio"]')[0]);
    expect(saveScore).toHaveBeenCalledTimes(1);
    const doc = (saveScore.mock.calls[0] as unknown[])[2] as {
      seat: number;
      points: number;
      max: number;
      levels: Record<string, number>;
    };
    expect(doc).toMatchObject({
      seat: 1,
      points: 7,
      max: 7,
      levels: { a: 1, b: 1 },
    });
  });
});
