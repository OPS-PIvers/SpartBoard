// Regression: the student page listed a run's groups unfiltered, which the class-gated read rule always denies.

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useStudentProjectRun } from '@/hooks/useStudentProjectRun';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  onSnapshot: vi.fn(() => () => undefined),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({
    ref,
    constraints,
  })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const RUN_ID = 'teacher-1_proj-1';

describe('useStudentProjectRun groups listener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters the run's groups to the student's own classes", () => {
    renderHook(() =>
      useStudentProjectRun(RUN_ID, 'student-1', ['class-b', 'class-a'])
    );

    expect(collection).toHaveBeenCalledWith(
      {},
      'project_runs',
      RUN_ID,
      'groups'
    );
    expect(where).toHaveBeenCalledWith('classId', 'in', ['class-a', 'class-b']);
    expect(query).toHaveBeenCalledTimes(1);
    const listened = (onSnapshot as Mock).mock.calls.map(
      (call: unknown[]) => call[0]
    );
    expect(listened).toContainEqual({
      ref: { path: ['project_runs', RUN_ID, 'groups'] },
      constraints: [
        { field: 'classId', op: 'in', value: ['class-a', 'class-b'] },
      ],
    });
  });

  it('never issues an unfiltered groups listing', () => {
    renderHook(() => useStudentProjectRun(RUN_ID, 'student-1', []));

    expect(query).not.toHaveBeenCalled();
    const listened = (onSnapshot as Mock).mock.calls.map(
      (call: unknown[]) => call[0]
    );
    expect(listened).not.toContainEqual({
      path: ['project_runs', RUN_ID, 'groups'],
    });
  });
});
