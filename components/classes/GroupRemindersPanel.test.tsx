import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RosterEditorModal } from './RosterEditorModal';
import type { ClassRoster, RosterGroup } from '@/types';

vi.mock('@/utils/timeToolAudio', () => ({
  playTimerAlert: vi.fn(),
  resumeAudio: vi.fn(() => Promise.resolve()),
}));

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

const renderModal = (r: ClassRoster, enabled = true) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <RosterEditorModal
      isOpen
      roster={r}
      onClose={vi.fn()}
      onSave={onSave}
      groupRemindersEnabled={enabled}
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
    await user.click(screen.getByRole('button', { name: 'heart' }));
    await user.type(screen.getByLabelText(/name \(optional\)/i), 'Speech');
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    // Step 3: schedule
    await user.click(screen.getByRole('button', { name: /monday/i }));
    await user.click(screen.getByRole('button', { name: /wednesday/i }));
    fireEvent.change(screen.getByLabelText(/^time$/i), {
      target: { value: '10:15' },
    });
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    // Step 4: alerts, defaults left alone
    expect(
      screen.getByRole('switch', { name: /enable in group maker/i })
    ).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: /save group/i }));

    expect(screen.getByText('Speech')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [group] = onSave.mock.calls[0][2] as RosterGroup[];
    expect(group).toMatchObject({
      name: 'Speech',
      studentIds: ['s2'],
      inGroupMaker: false,
      symbol: { kind: 'shape', shape: 'heart', showName: false },
      reminder: {
        enabled: true,
        days: [1, 3],
        time: '10:15',
        repeat: 'weekly',
        sound: 'off',
        showStudentNames: false,
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
    expect(
      screen.getByRole('switch', { name: /reminder on the board/i })
    ).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: /save group/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [group] = onSave.mock.calls[0][2] as RosterGroup[];
    expect(group.inGroupMaker).toBeUndefined();
    expect(group.reminder?.enabled).toBe(false);
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
});
