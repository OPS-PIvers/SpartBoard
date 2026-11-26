import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SetStudentTimeDialog } from './SetStudentTimeDialog';
import { formatStudentTime } from './studentTimeFormat';
import { combineDateAndTime } from '@/utils/localDate';

const NOW = combineDateAndTime('2026-11-24', '08:02') as number;

describe('SetStudentTimeDialog', () => {
  it('saves the picked window, starting at the next five minutes by default', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <SetStudentTimeDialog
        studentName="Lopez, Ana"
        current={null}
        now={NOW}
        onClose={onClose}
        onSave={onSave}
      />
    );
    expect(screen.getByText('Schedule Lopez, Ana')).toBeTruthy();
    expect(screen.queryByText('Remove schedule')).toBeNull();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      from: combineDateAndTime('2026-11-24', '08:05'),
      until: combineDateAndTime('2026-11-24', '09:05'),
    });
  });

  it('blocks a close before the open and warns past the due date', () => {
    render(
      <SetStudentTimeDialog
        studentName="Lopez, Ana"
        current={null}
        dueAt={NOW + 30 * 60 * 1000}
        now={NOW}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        'Any work submitted after the due date will be marked Late.'
      )
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Closes time'), {
      target: { value: '07:00' },
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'Closes must be after Opens.'
    );
    expect(screen.getByText<HTMLButtonElement>('Save').disabled).toBe(true);
  });

  it('removes an existing time', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SetStudentTimeDialog
        studentName="Lopez, Ana"
        current={{ from: NOW + 1000, until: NOW + 2000 }}
        now={NOW}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByText('Remove schedule'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });

  it('formats a same-day and a two-day window', () => {
    const from = combineDateAndTime('2026-11-26', '09:00') as number;
    expect(formatStudentTime({ from, until: from + 3_600_000 })).toMatch(
      /^Thu, Nov 26, 9:00\sAM to 10:00\sAM$/
    );
    expect(formatStudentTime({ from, until: from + 24 * 3_600_000 })).toMatch(
      /to Fri, Nov 27, 9:00\sAM$/
    );
  });
});
