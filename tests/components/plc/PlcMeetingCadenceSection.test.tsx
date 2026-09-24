// PLC Settings meeting schedule: leads and co-leads edit it, members only read it.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Plc } from '@/types';
import { PlcMeetingCadenceSection } from '@/components/plc/settings/PlcMeetingCadenceSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (_k: string, o?: Record<string, unknown>) => {
      let template = (o?.defaultValue as string) ?? _k;
      if (o) {
        for (const [key, value] of Object.entries(o)) {
          template = template.replace(
            new RegExp(`{{${key}}}`, 'g'),
            String(value)
          );
        }
      }
      return template;
    },
  }),
}));

let mockUid = 'uid-lead';
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: mockUid } }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
const updatePlcMeetingCadence = vi.fn((_plcId: string, _cadence: unknown) =>
  Promise.resolve()
);
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ updatePlcMeetingCadence }),
}));

const basePlc = {
  id: 'plc-1',
  name: 'Grade 7 Math',
  members: {},
  leadUid: 'uid-lead',
  memberUids: ['uid-lead', 'uid-member'],
  memberEmails: {},
  createdAt: 0,
  updatedAt: 0,
} as unknown as Plc;

describe('PlcMeetingCadenceSection', () => {
  beforeEach(() => {
    mockUid = 'uid-lead';
    updatePlcMeetingCadence.mockClear();
  });

  it('lets the lead save a monthly schedule with a default agenda', async () => {
    render(<PlcMeetingCadenceSection plc={basePlc} />);
    expect(screen.getByText('No meeting schedule set.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Repeats'), {
      target: { value: 'monthlyNthWeekday' },
    });
    fireEvent.change(screen.getByLabelText('Week of the month'), {
      target: { value: '-1' },
    });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Time'), {
      target: { value: '07:30' },
    });
    fireEvent.change(screen.getByLabelText('Starting on'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByLabelText('Default agenda (optional)'), {
      target: { value: 'Data review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() =>
      expect(updatePlcMeetingCadence).toHaveBeenCalledWith('plc-1', {
        frequency: 'monthlyNthWeekday',
        weekday: 5,
        nth: -1,
        time: '07:30',
        anchorDate: '2026-10-01',
        defaultAgenda: 'Data review',
      })
    );
  });

  it('drops move and skip overrides when the dates change', async () => {
    const plc = {
      ...basePlc,
      meetingCadence: {
        frequency: 'weekly',
        weekday: 4,
        time: '15:15',
        anchorDate: '2026-09-03',
        overrides: { '2026-09-24': { skipped: true } },
      },
    } as unknown as Plc;
    render(<PlcMeetingCadenceSection plc={plc} />);
    fireEvent.change(screen.getByLabelText('Time'), {
      target: { value: '15:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() =>
      expect(updatePlcMeetingCadence).toHaveBeenLastCalledWith(
        'plc-1',
        expect.objectContaining({
          overrides: { '2026-09-24': { skipped: true } },
        })
      )
    );
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() =>
      expect(updatePlcMeetingCadence).toHaveBeenLastCalledWith(
        'plc-1',
        expect.not.objectContaining({ overrides: expect.anything() })
      )
    );
  });

  it('shows members a read-only summary', () => {
    mockUid = 'uid-member';
    const plc = {
      ...basePlc,
      meetingCadence: {
        frequency: 'biweekly',
        weekday: 4,
        time: '15:15',
        anchorDate: '2026-09-03',
      },
    } as unknown as Plc;
    render(<PlcMeetingCadenceSection plc={plc} />);
    expect(
      screen.getByText(/Every other Thursday at 3:15/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save schedule' })).toBeNull();
  });
});
