import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassRoster, RosterGroup } from '@/types';
import { GroupReminderLayer } from './GroupReminderLayer';
import { playTimerAlert } from '@/utils/timeToolAudio';

vi.mock('@/utils/timeToolAudio', () => ({
  playTimerAlert: vi.fn(),
  resumeAudio: vi.fn(() => Promise.resolve()),
}));

const reminder: NonNullable<RosterGroup['reminder']> = {
  enabled: true,
  days: [1],
  time: '10:15',
  repeat: 'weekly',
  startDate: '2026-09-28',
  sound: 'off',
  showStudentNames: false,
};

const group = (patch: Partial<RosterGroup> = {}): RosterGroup => ({
  id: 'g1',
  name: 'Speech',
  studentIds: ['s1'],
  inGroupMaker: false,
  symbol: { kind: 'shape', shape: 'star', color: '#f59e0b', showName: false },
  reminder,
  ...patch,
});

const rosters = (g: RosterGroup): ClassRoster[] => [
  {
    id: 'r1',
    name: 'Room 112',
    driveFileId: null,
    studentCount: 1,
    createdAt: 0,
    students: [{ id: 's1', firstName: 'Ben', lastName: 'Carlson', pin: '01' }],
    groups: [g],
  },
];

describe('GroupReminderLayer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    // Monday 2026-09-28, 10:14:55 local.
    vi.setSystemTime(new Date(2026, 8, 28, 10, 14, 55));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(playTimerAlert).mockClear();
  });

  it('pops at the time showing only the symbol and time', () => {
    render(<GroupReminderLayer rosters={rosters(group())} />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const card = screen.getByRole('alert');
    expect(card).toHaveTextContent('Time to go');
    expect(card).not.toHaveTextContent('Speech');
    expect(card).not.toHaveTextContent('Ben');
    expect(playTimerAlert).not.toHaveBeenCalled();
  });

  it('shows the name, students and sound only when opted in', () => {
    const g = group({
      symbol: { kind: 'emoji', emoji: '🐢', color: '#f59e0b', showName: true },
      reminder: { ...reminder, sound: 'chime', showStudentNames: true },
    });
    render(<GroupReminderLayer rosters={rosters(g)} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Speech · Ben');
  });

  it('snoozes for three minutes, then alerts again', () => {
    render(<GroupReminderLayer rosters={rosters(group())} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    fireEvent.click(screen.getByRole('button', { name: /snooze 3 min/i }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/snoozed until/i)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000 + 100);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Time to go');
  });

  it('stays dismissed after a reload the same day', () => {
    const { unmount } = render(
      <GroupReminderLayer rosters={rosters(group())} />
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByTestId('group-reminder-layer')).toBeNull();
    unmount();
    render(<GroupReminderLayer rosters={rosters(group())} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
