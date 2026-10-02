import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { BuildingScheduleDefaults } from '@/types';
import type { ClassDirectoryResult } from '@/hooks/useStudentClassDirectory';
import { MyAssignmentsPage } from './MyAssignmentsPage';

const directory: { value: ClassDirectoryResult } = {
  value: { status: 'loading', classes: [], byId: {}, retry: vi.fn() },
};

vi.mock('@/context/useStudentAuth', () => ({
  useStudentAuth: () => ({
    classIds: ['ENG', 'HOMEROOM', 'ART', 'ALG', 'BIO'],
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

const landing: { v2: boolean | null } = { v2: false };
vi.mock('@/hooks/useStudentLandingV2', () => ({
  useStudentLandingV2Enabled: () => landing.v2,
}));

const clock = { now: 0 };
const OMS: BuildingScheduleDefaults = {
  buildingId: 'oms',
  items: [],
  schedules: [
    {
      id: 'regular',
      name: 'Regular',
      days: [1, 2, 3, 4, 5],
      items: [
        {
          task: 'P1',
          startTime: '08:00',
          endTime: '08:50',
          isClassPeriod: true,
          periodId: '1',
        },
        {
          task: 'P2',
          startTime: '09:00',
          endTime: '09:50',
          isClassPeriod: true,
          periodId: '2',
        },
      ],
    },
    { id: 'early', name: 'Early', days: [], items: [] },
  ],
};
const schedules = { status: 'ready' as 'ready' | 'loading' };
vi.mock('@/hooks/useStudentBellSchedules', () => ({
  useStudentBellSchedules: () => ({
    status: schedules.status,
    scheduleFor: (id: string) => (id === 'oms' ? OMS : null),
  }),
}));

vi.mock('@/utils/serverTime', () => ({
  getServerNow: () => clock.now,
  syncServerTime: vi.fn(),
}));

vi.mock('./StudentOverview', () => ({
  StudentOverview: () => <div>overview</div>,
}));

// 2026-10-02 is a Friday.
const at = (h: number, m: number) => new Date(2026, 9, 2, h, m).getTime();

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  landing.v2 = false;
  schedules.status = 'ready';
  clock.now = at(8, 30);
  window.history.replaceState(null, '', '/my-assignments');
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

describe('MyAssignmentsPage bell period', () => {
  const entry = (classId: string, name: string, periodId?: string) => ({
    classId,
    name,
    teacherDisplayName: `T-${classId}`,
    ...(periodId ? { bellPeriod: { buildingId: 'oms', periodId } } : {}),
  });
  const setClasses = () => {
    const list = [
      entry('ART', 'Art'),
      entry('ALG', 'Algebra', '2'),
      entry('BIO', 'Biology', '1'),
    ];
    directory.value = {
      status: 'ready',
      classes: list,
      byId: Object.fromEntries(list.map((c) => [c.classId, c])),
      retry: vi.fn(),
    };
  };
  const sidebarOrder = () =>
    within(
      screen.queryByRole('navigation', { name: 'Classes' }) ?? document.body
    )
      .getAllByRole('button')
      .map((b) => /^\w?(Art|Algebra|Biology)/.exec(b.textContent ?? '')?.[1])
      .filter(Boolean);
  const heading = () =>
    screen.queryByRole('heading', { level: 1 })?.textContent;

  it('keeps the old name order and opens the Overview with the flag off', () => {
    setClasses();
    render(<MyAssignmentsPage />);
    expect(sidebarOrder()).toEqual(['Art', 'Algebra', 'Biology']);
    expect(screen.getByText('overview')).toBeTruthy();
  });

  it('waits for the flag before showing the page', () => {
    setClasses();
    landing.v2 = null;
    render(<MyAssignmentsPage />);
    expect(screen.getByText('Loading your assignments…')).toBeTruthy();
  });

  it('orders by bell period and opens the class in session', () => {
    setClasses();
    landing.v2 = true;
    render(<MyAssignmentsPage />);
    expect(sidebarOrder()).toEqual(['Biology', 'Algebra', 'Art']);
    expect(heading()).toBe('Biology');
  });

  it('opens the Overview when no class is in session', () => {
    setClasses();
    landing.v2 = true;
    clock.now = at(12, 0);
    render(<MyAssignmentsPage />);
    expect(screen.getByText('Up next')).toBeTruthy();
  });

  it('lets a class in the URL win', () => {
    setClasses();
    landing.v2 = true;
    window.history.replaceState(null, '', '/my-assignments/ALG');
    render(<MyAssignmentsPage />);
    expect(heading()).toBe('Algebra');
  });

  const away = (ms: number) => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    const realNow = Date.now;
    Date.now = () => realNow() + ms;
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Date.now = realNow;
    visibility.mockRestore();
  };

  it('re-selects after the tab was away more than 10 minutes', () => {
    setClasses();
    landing.v2 = true;
    render(<MyAssignmentsPage />);
    expect(heading()).toBe('Biology');
    clock.now = at(9, 20);
    away(11 * 60 * 1000);
    expect(heading()).toBe('Algebra');
  });

  it('ignores a short absence', () => {
    setClasses();
    landing.v2 = true;
    render(<MyAssignmentsPage />);
    clock.now = at(9, 20);
    away(5 * 60 * 1000);
    expect(heading()).toBe('Biology');
  });

  it('never switches once the student has picked a class', () => {
    setClasses();
    landing.v2 = true;
    render(<MyAssignmentsPage />);
    fireEvent.click(screen.getByRole('button', { name: /^Art/ }));
    expect(heading()).toBe('Art');
    clock.now = at(9, 20);
    away(11 * 60 * 1000);
    expect(heading()).toBe('Art');
  });
});
