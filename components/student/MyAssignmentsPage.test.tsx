import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ClassDirectoryResult } from '@/hooks/useStudentClassDirectory';
import { MyAssignmentsPage } from './MyAssignmentsPage';

const directory: { value: ClassDirectoryResult } = {
  value: { status: 'loading', classes: [], byId: {}, retry: vi.fn() },
};

vi.mock('@/context/useStudentAuth', () => ({
  useStudentAuth: () => ({
    classIds: ['ENG', 'HOMEROOM'],
    pseudonymUid: 'student-1',
    firstName: null,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStudentClassDirectory', () => ({
  useStudentClassDirectory: () => directory.value,
}));

vi.mock('@/hooks/useStudentAssignments', () => ({
  isClosedProjectRun: () => false,
  useStudentAssignments: () => ({
    loadState: 'ready',
    assignments: [],
    hasErrors: false,
    hasClassErrors: false,
    retry: vi.fn(),
  }),
}));

vi.mock('@/hooks/useProjectsWidgetSettings', () => ({
  useProjectsWidgetSettings: () => ({ enabled: true }),
}));

vi.mock('@/hooks/useStudentGrades', () => ({
  useStudentGradebookEnabled: () => false,
  useStudentGrades: () => ({ status: 'loading' }),
}));

vi.mock('@/utils/serverTime', () => ({
  getServerNow: () => Date.now(),
  syncServerTime: vi.fn(),
}));

vi.mock('./StudentOverview', () => ({
  StudentOverview: () => <div>overview</div>,
}));

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

describe('MyAssignmentsPage class list', () => {
  it('shows an error with Retry when the class directory fails', () => {
    const retry = vi.fn();
    directory.value = { status: 'error', classes: [], byId: {}, retry };
    render(<MyAssignmentsPage />);

    expect(screen.getByText("We couldn't load your classes")).toBeTruthy();
    expect(screen.queryByText('Class')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('lists only classes the directory resolved', () => {
    const eng = {
      classId: 'ENG',
      name: 'English 9 Honors',
      teacherDisplayName: 'Ms. Ortiz & Mr. Lee',
    };
    directory.value = {
      status: 'ready',
      classes: [eng],
      byId: { ENG: eng },
      retry: vi.fn(),
    };
    render(<MyAssignmentsPage />);

    expect(screen.getByText('English 9 Honors')).toBeTruthy();
    expect(screen.getByText('Ms. Ortiz & Mr. Lee')).toBeTruthy();
    expect(screen.queryByText('Class')).toBeNull();
    expect(screen.getByText('1 class')).toBeTruthy();
  });
});
