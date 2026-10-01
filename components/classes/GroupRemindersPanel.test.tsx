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

const renderModal = (r: ClassRoster, enabled = true, emails = false) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <RosterEditorModal
      isOpen
      roster={r}
      onClose={vi.fn()}
      onSave={onSave}
      groupRemindersEnabled={enabled}
      groupReminderEmailsEnabled={emails}
    />
  );
  return onSave;
};

describe('GroupRemindersPanel', () => {
  it('creates a private, Group Maker-off group through the wizard', async () => {
    const user = userEvent.setup();
    const onSave = renderModal(roster());

    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /new group/i }));

    // Step 1: students
    const next = screen.getByRole('button', { name: /^next$/i });
    expect(next).toBeDisabled();
    // user-event's click does not toggle a label-wrapped checkbox under jsdom here.
    fireEvent.click(screen.getByLabelText('Ben Carlson'));
    await user.click(next);

    // Step 2: symbol
    await user.type(screen.getByRole('searchbox'), 'turt');
    expect(screen.queryByRole('button', { name: 'heart' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'turtle' }));
    await user.type(screen.getByLabelText(/name \(optional\)/i), 'Speech');
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    // Step 3: schedule
    await user.click(screen.getByRole('button', { name: /monday/i }));
    await user.click(screen.getByRole('button', { name: /wednesday/i }));
    fireEvent.change(screen.getByLabelText(/^time$/i), {
      target: { value: '10:15' },
    });
    await user.click(
      screen.getByRole('button', { name: /add another alert/i })
    );
    fireEvent.change(screen.getAllByLabelText(/^time$/i)[1], {
      target: { value: '13:40' },
    });
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    // Step 4: alerts, defaults left alone
    expect(
      screen.getByRole('switch', { name: /enable in group maker/i })
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByRole('switch', { name: /reminder on the board/i })
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('switch', { name: /email alert/i })).toBeNull();
    await user.click(screen.getByRole('switch', { name: /show a message/i }));
    await user.type(screen.getByLabelText(/^message$/i), 'Speech now');
    await user.click(screen.getByRole('button', { name: /save group/i }));

    expect(screen.getByText('Speech')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^save$/i }));
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

  it('keeps existing groups in Group Maker when edited', async () => {
    const user = userEvent.setup();
    const onSave = renderModal(
      roster([{ id: 'g1', name: 'Teams (1)', studentIds: ['s1'] }])
    );

    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /alerts/i }));
    expect(
      screen.getByRole('switch', { name: /enable in group maker/i })
    ).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: /save group/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [group] = onSave.mock.calls[0][2] as RosterGroup[];
    expect(group.inGroupMaker).toBeUndefined();
  });

  it('saves an email alert with the teacher message when emails are on', async () => {
    const user = userEvent.setup();
    const onSave = renderModal(
      roster([{ id: 'g1', name: 'Speech', studentIds: ['s1'] }]),
      true,
      true
    );
    await user.click(screen.getByRole('tab', { name: /groups/i }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /alerts/i }));
    const email = screen.getByRole('switch', { name: /email alert/i });
    expect(email).toHaveAttribute('aria-checked', 'false');
    await user.click(email);
    await user.type(
      screen.getByLabelText(/email message/i),
      'Walk them to room 104'
    );
    await user.click(screen.getByRole('button', { name: /save group/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [group] = onSave.mock.calls[0][2] as RosterGroup[];
    expect(group.reminder).toMatchObject({
      emailAlert: true,
      emailMessage: 'Walk them to room 104',
    });
  });

  it('keeps the plain groups editor while the feature is off', async () => {
    const user = userEvent.setup();
    renderModal(roster(), false);
    await user.click(screen.getByRole('tab', { name: /groups/i }));
    expect(screen.getByText(/no groups yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /\+ new group/i }));
    expect(screen.queryByRole('button', { name: /^next$/i })).toBeNull();
    expect(screen.getByDisplayValue('New Group')).toBeInTheDocument();
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
