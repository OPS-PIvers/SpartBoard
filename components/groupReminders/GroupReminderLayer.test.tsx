import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassRoster, RosterGroup } from '@/types';
import { GroupReminderLayer } from './GroupReminderLayer';
import { playReminderSound } from '@/utils/reminderSounds';

vi.mock('@/utils/reminderSounds', () => ({ playReminderSound: vi.fn() }));

const reminder: NonNullable<RosterGroup['reminder']> = {
  enabled: true,
  days: [1],
  alerts: [{ time: '10:15', leadMinutes: 0 }],
  repeat: 'weekly',
  startDate: '2026-09-28',
  sound: 'off',
  snoozeMinutes: 3,
  showName: false,
  showTime: false,
  showMessage: false,
  message: '',
};

const group = (patch: Partial<RosterGroup> = {}): RosterGroup => ({
  id: 'g1',
  name: 'Speech',
  studentIds: ['s1'],
  inGroupMaker: false,
  symbol: { icon: 'turtle', color: '#f59e0b' },
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
    vi.mocked(playReminderSound).mockClear();
  });

  it('pops at the time showing only the icon', () => {
    render(<GroupReminderLayer rosters={rosters(group())} />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('');
    expect(playReminderSound).toHaveBeenCalledWith('off');
  });

  it('shows the message, name, time and sound only when opted in', () => {
    const g = group({
      reminder: {
        ...reminder,
        sound: 'bell',
        showName: true,
        showTime: true,
        showMessage: true,
      },
    });
    render(<GroupReminderLayer rosters={rosters(g)} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const card = screen.getByRole('alert');
    expect(card).toHaveTextContent('Time to go');
    expect(card).toHaveTextContent('Speech');
    expect(card).toHaveTextContent(/10:15/);
    expect(card).not.toHaveTextContent('Ben');
    expect(playReminderSound).toHaveBeenCalledWith('bell');
  });

  it('shows up the chosen minutes ahead of the time', () => {
    const g = group({
      reminder: { ...reminder, alerts: [{ time: '10:15', leadMinutes: 5 }] },
    });
    vi.setSystemTime(new Date(2026, 8, 28, 10, 9, 55));
    render(<GroupReminderLayer rosters={rosters(g)} />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('snoozes for the chosen length, then alerts again', () => {
    const g = group({ reminder: { ...reminder, snoozeMinutes: 5 } });
    render(<GroupReminderLayer rosters={rosters(g)} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    fireEvent.click(screen.getByRole('button', { name: /snooze 5 min/i }));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000 + 100);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
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
