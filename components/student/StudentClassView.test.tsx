import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { StudentGradesState } from '@/hooks/useStudentGrades';
import { StudentClassView } from './StudentClassView';

const grades: { state: StudentGradesState } = {
  state: {
    status: 'ready',
    data: {
      entries: {
        s1: {
          kind: 'quiz',
          title: 'Character Quiz',
          dueAt: Date.UTC(2026, 8, 16, 12),
          status: 'scored',
          points: 15,
          max: 15,
          pct: 100,
          flags: [],
          comment: 'Great work',
        },
      },
      standards: null,
      levelNames: ['Proficient', 'Approaching', 'Beginning'],
    },
  },
};

vi.mock('@/hooks/useStudentGrades', () => ({
  useStudentGrades: () => grades.state,
}));

vi.mock('./AssignmentSections', () => ({
  AssignmentSections: () => <div>assignment list</div>,
}));

const props = {
  classId: 'c1',
  classEntry: { classId: 'c1', name: 'English 8', teacherDisplayName: 'T' },
  todayDate: 'Wed, Sep 30',
  active: [],
  completed: [],
  filterMode: 'active' as const,
  onFilterChange: () => undefined,
  pseudonymUid: 'student-1',
  directoryById: {},
  onCompletionResolved: () => undefined,
};

describe('StudentClassView Grades tab', () => {
  it('is unchanged while the flag is off', () => {
    render(<StudentClassView {...props} tab="grades" />);
    expect(screen.queryByRole('tab', { name: /Grades/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Active/ })).toBeTruthy();
    expect(screen.getByText('assignment list')).toBeTruthy();
  });

  it('switches to the published grades with a New badge', () => {
    localStorage.clear();
    const onTabChange = vi.fn();
    const { rerender } = render(
      <StudentClassView {...props} gradesEnabled onTabChange={onTabChange} />
    );
    const gradesTab = screen.getByRole('tab', { name: /Grades/ });
    expect(gradesTab.textContent).toContain('NEW');
    fireEvent.click(gradesTab);
    expect(onTabChange).toHaveBeenCalledWith('grades');
    rerender(
      <StudentClassView
        {...props}
        gradesEnabled
        tab="grades"
        onTabChange={onTabChange}
      />
    );
    expect(screen.getByText('Character Quiz')).toBeTruthy();
    expect(screen.getByText('15/15')).toBeTruthy();
    expect(screen.getByText('Great work')).toBeTruthy();
    expect(screen.queryByText('assignment list')).toBeNull();
  });
});
