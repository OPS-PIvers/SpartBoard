import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockCall = vi.fn();
let callImpl: (payload: unknown) => Promise<unknown> = () => Promise.resolve();

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  // A plain function: vitest's spy flags a returned rejection as unhandled.
  httpsCallable: () => (payload: unknown) => {
    mockCall(payload);
    return callImpl(payload);
  },
}));

import { ActiveStudentsModal } from '@/components/admin/Analytics/ActiveStudentsModal';
import { studentsForCategory } from '@/components/admin/Analytics/activeStudents';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

const rows = [
  {
    name: 'Ana Lee',
    teachers: [
      { name: 'Mr. Adams', lastOpenedMs: NOW - 3 * 24 * HOUR },
      { name: 'Ms. Zed', lastOpenedMs: NOW - HOUR },
    ],
    lastSignInMs: NOW - HOUR,
  },
  { name: 'Ben Ortiz', teachers: [], lastSignInMs: NOW - 5 * 24 * HOUR },
  {
    name: '',
    teachers: [{ name: 'Ms. Zed', lastOpenedMs: NOW - 2 * HOUR }],
    lastSignInMs: NOW - 2 * HOUR,
  },
];

describe('studentsForCategory', () => {
  it('narrows students and teachers to the last 24 hours for the daily list', () => {
    const daily = studentsForCategory(rows, 'dailyStudents', NOW);
    expect(daily.map((r) => [r.name, r.teachers])).toEqual([
      ['Ana Lee', ['Ms. Zed']],
      ['', ['Ms. Zed']],
    ]);
    const monthly = studentsForCategory(rows, 'monthlyStudents', NOW);
    expect(monthly[0].teachers).toEqual(['Mr. Adams', 'Ms. Zed']);
    expect(monthly).toHaveLength(3);
  });
});

describe('ActiveStudentsModal', () => {
  beforeEach(() => mockCall.mockReset());

  it('lists students with their teachers', async () => {
    callImpl = () =>
      Promise.resolve({ data: { asOf: NOW, partial: false, students: rows } });
    render(
      <ActiveStudentsModal
        orgId="orono"
        category="monthlyStudents"
        onClose={() => undefined}
      />
    );
    expect(await screen.findByText('Ana Lee')).toBeInTheDocument();
    expect(screen.getByText('Mr. Adams, Ms. Zed')).toBeInTheDocument();
    expect(screen.getByText('Name unavailable')).toBeInTheDocument();
    expect(mockCall).toHaveBeenCalledWith({ orgId: 'orono' });
  });

  it('explains a permission refusal', async () => {
    callImpl = () =>
      Promise.reject(
        Object.assign(new Error('denied'), {
          code: 'functions/permission-denied',
        })
      );
    render(
      <ActiveStudentsModal
        orgId="orono"
        category="dailyStudents"
        onClose={() => undefined}
      />
    );
    expect(
      await screen.findByText('Only district admins can view the student list.')
    ).toBeInTheDocument();
  });
});
