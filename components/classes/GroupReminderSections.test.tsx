import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RosterEditorModal } from './RosterEditorModal';
import type { ClassRoster, RosterGroup } from '@/types';
import type { GroupScheduleJob } from '@/utils/groupSchedulePrint';
import type { GroupEditorSteps } from '@/utils/groupReminders';

// An existing class saves on its own; closing flushes it. New Class still has Save.
const saveClassButton = () =>
  screen.queryByRole('button', { name: /^save$/i }) ??
  screen.getByRole('button', { name: /^close$/i });

vi.mock('@/components/common/library/assignStepper/SupportsEditor', () => ({
  SupportsEditor: () => null,
}));
vi.mock('@/utils/reminderSounds', () => ({ playReminderSound: vi.fn() }));
const printGroupSchedule = vi.hoisted(() =>
  vi.fn<(job: GroupScheduleJob) => void>()
);
vi.mock('@/utils/groupSchedulePrint', () => ({ printGroupSchedule }));

const roster = (groups: RosterGroup[] = []): ClassRoster => ({
  id: 'r1',
  name: 'Room 112',
  driveFileId: null,
  studentCount: 3,
  createdAt: 0,
  students: [
    { id: 's1', firstName: 'Ava', lastName: 'Anderson', pin: '01' },
    { id: 's2', firstName: 'Ben', lastName: 'Carlson', pin: '02' },
    { id: 's3', firstName: 'Chloe', lastName: 'Dahl', pin: '03' },
  ],
  groups,
});

const renderModal = (
  r: ClassRoster,
  enabled = true,
  emails = false,
  groupSteps?: GroupEditorSteps
) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <RosterEditorModal
      isOpen
      roster={r}
      onClose={vi.fn()}
      onSave={onSave}
      groupRemindersEnabled={enabled}
      groupReminderEmailsEnabled={emails}
      groupSteps={groupSteps}
    />
  );
  return onSave;
};

const openGroup = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('tab', { name: /groups/i }));
  await user.click(screen.getByRole('button', { name: /^edit$/i }));
};

describe('Group reminders on the group page', () => {
  it('creates a private group with a symbol, schedule and accommodations on one page', async () => {
    const user = userEvent.setup();
    const onSave = renderModal(roster());

    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /new group/i }));
    await user.type(
      screen.getByRole('textbox', { name: 'Group name' }),
      'Speech'
    );
    fireEvent.click(screen.getByLabelText('Carlson, Ben'));

    await user.type(screen.getByRole('searchbox'), 'turt');
    expect(screen.queryByRole('button', { name: 'heart' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'turtle' }));

    expect(
      screen.getByRole('switch', { name: /reminder on the board/i })
    ).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: /monday/i }));
    await user.click(screen.getByRole('button', { name: /wednesday/i }));
    fireEvent.change(screen.getByLabelText(/^time$/i), {
      target: { value: '10:15' },
    });
    await user.click(screen.getByRole('button', { name: /add another time/i }));
    fireEvent.change(screen.getAllByLabelText(/^time$/i)[1], {
      target: { value: '13:40' },
    });
    expect(screen.queryByRole('switch', { name: /email alert/i })).toBeNull();
    await user.click(screen.getByRole('switch', { name: /show a message/i }));
    await user.type(screen.getByLabelText(/^message$/i), 'Speech now');

    expect(
      screen.getByRole('switch', { name: /show in widgets/i })
    ).toHaveAttribute('aria-checked', 'false');
    // The accommodations section is on the same page.
    expect(
      screen.getByRole('heading', { name: 'Accommodations' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(screen.getByText('Speech')).toBeInTheDocument();
    await user.click(saveClassButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [group] = onSave.mock.calls[0][2] as RosterGroup[];
    expect(group).toMatchObject({
      name: 'Speech',
      studentIds: ['s2'],
      inGroupMaker: false,
      symbol: { icon: 'turtle' },
      reminder: {
        enabled: true,
        days: [1, 3],
        alerts: [
          { time: '10:15', leadMinutes: 0 },
          { time: '13:40', leadMinutes: 0 },
        ],
        repeat: 'weekly',
        sound: 'off',
        snoozeMinutes: 3,
        showName: false,
        showTime: false,
        showMessage: true,
        message: 'Speech now',
      },
    });
  });

  it('hides the schedule fields while the board reminder is off', async () => {
    const user = userEvent.setup();
    renderModal(roster([{ id: 'g1', name: 'Speech', studentIds: ['s1'] }]));
    await openGroup(user);
    await user.click(
      screen.getByRole('switch', { name: /reminder on the board/i })
    );
    expect(screen.queryByRole('button', { name: /monday/i })).toBeNull();
    expect(
      screen.queryByRole('switch', { name: /show a message/i })
    ).toBeNull();
  });

  it('keeps existing groups in widgets when edited', async () => {
    const user = userEvent.setup();
    renderModal(roster([{ id: 'g1', name: 'Teams (1)', studentIds: ['s1'] }]));
    await openGroup(user);
    expect(
      screen.getByRole('switch', { name: /show in widgets/i })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('saves an email alert with the teacher message when emails are on', async () => {
    const user = userEvent.setup();
    const onSave = renderModal(
      roster([{ id: 'g1', name: 'Speech', studentIds: ['s1'] }]),
      true,
      true
    );
    await openGroup(user);
    const email = screen.getByRole('switch', { name: /email alert/i });
    expect(email).toHaveAttribute('aria-checked', 'false');
    await user.click(email);
    await user.type(
      screen.getByLabelText(/email message/i),
      'Walk them to room 104'
    );
    await user.click(saveClassButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [group] = onSave.mock.calls[0][2] as RosterGroup[];
    expect(group.reminder).toMatchObject({
      emailAlert: true,
      emailMessage: 'Walk them to room 104',
    });
  });

  it('sets a group time limit for admins with Group reminders on', async () => {
    const user = userEvent.setup();
    const onSave = renderModal(
      roster([{ id: 'g1', name: 'Extra time', studentIds: ['s1', 's3'] }])
    );
    await openGroup(user);
    await user.click(screen.getByRole('radio', { name: '2x' }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(screen.getByText(/2x time/i)).toBeInTheDocument();
    await user.click(saveClassButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const overrides = onSave.mock.calls[0][3] as Record<string, unknown>;
    expect(overrides).toMatchObject({
      s1: { timeMultiplier: 2 },
      s3: { timeMultiplier: 2 },
    });
  });

  it('hides the sections an admin turned off', async () => {
    const user = userEvent.setup();
    const onSave = renderModal(roster(), true, false, {
      symbol: false,
      schedule: false,
      settings: false,
    });
    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /new group/i }));
    expect(screen.queryByRole('heading', { name: 'Symbol' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Schedule' })).toBeNull();
    expect(
      screen.queryByRole('switch', { name: /show in widgets/i })
    ).toBeNull();
    fireEvent.click(screen.getByLabelText('Carlson, Ben'));
    await user.type(
      screen.getByRole('textbox', { name: 'Group name' }),
      'Reading'
    );
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    await user.click(saveClassButton());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [group] = onSave.mock.calls[0][2] as RosterGroup[];
    expect(group.name).toBe('Reading');
    expect(group.reminder).toBeUndefined();
    expect(group.symbol).toBeUndefined();
    expect(group.inGroupMaker).toBeUndefined();
  });

  it('shows no symbol or schedule while the feature is off', async () => {
    const user = userEvent.setup();
    renderModal(roster(), false);
    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /new group/i }));
    expect(screen.queryByRole('heading', { name: 'Symbol' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Schedule' })).toBeNull();
    expect(
      screen.getByRole('textbox', { name: 'Group name' })
    ).toBeInTheDocument();
  });

  it('prints the class schedule once a group has reminder days', async () => {
    const user = userEvent.setup();
    const scheduled: RosterGroup = {
      id: 'g1',
      name: 'Speech',
      studentIds: ['s2'],
      symbol: { icon: 'turtle', color: '#16a34a' },
      reminder: {
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
        emailAlert: false,
        emailMessage: '',
      },
    };
    renderModal(roster([{ ...scheduled, reminder: undefined }]));
    await user.click(screen.getByRole('tab', { name: /groups/i }));
    expect(
      screen.queryByRole('button', { name: /print schedule/i })
    ).toBeNull();

    cleanup();
    renderModal(roster([scheduled]));
    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /print schedule/i }));
    expect(printGroupSchedule).toHaveBeenCalledTimes(1);
    const job = printGroupSchedule.mock.calls[0][0];
    expect(job.rosterName).toBe('Room 112');
    expect(job.groups).toEqual([scheduled]);
    expect(job.symbolSvg(scheduled)).toContain('<svg');
  });
});
