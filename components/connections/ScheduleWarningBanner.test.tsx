import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { playTimerAlert } from '@/utils/timeToolAudio';
import { ScheduleWarningBanner } from './ScheduleWarningBanner';

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/utils/timeToolAudio', () => ({
  getAudioCtx: vi.fn(() => ({ state: 'running' })),
  playTimerAlert: vi.fn(),
  resumeAudio: vi.fn(() => Promise.resolve()),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: { minutes?: number }) =>
      o?.minutes === undefined ? key : `Ends in ${o.minutes} min`,
  }),
}));

const board = (alert?: { id: string; at: number }) =>
  ({
    activeDashboard: {
      widgets: [
        {
          id: 's',
          type: 'schedule',
          config: {
            warningAlert: alert && {
              ...alert,
              task: 'Art',
              minutes: 5,
              sound: 'Gong',
            },
          },
        },
      ],
    },
  }) as unknown as ReturnType<typeof useDashboard>;

describe('ScheduleWarningBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      canAccessFeature: () => true,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('shows the message and plays the sound when an alert arrives', async () => {
    vi.mocked(useDashboard).mockReturnValue(board());
    const { rerender } = render(<ScheduleWarningBanner />);
    vi.mocked(useDashboard).mockReturnValue(
      board({ id: 'a1', at: Date.now() })
    );
    rerender(<ScheduleWarningBanner />);
    expect(await screen.findByText('Ends in 5 min')).toBeTruthy();
    expect(playTimerAlert).toHaveBeenCalledWith('Gong');
  });

  it('ignores an alert saved before the page opened', () => {
    vi.mocked(useDashboard).mockReturnValue(
      board({ id: 'old', at: Date.now() - 60_000 })
    );
    render(<ScheduleWarningBanner />);
    expect(screen.queryByText('Ends in 5 min')).toBeNull();
    expect(playTimerAlert).not.toHaveBeenCalled();
  });

  it('ignores an old alert that only appears after the page has been open a while', () => {
    vi.mocked(useDashboard).mockReturnValue(board());
    const { rerender } = render(<ScheduleWarningBanner />);
    vi.mocked(useDashboard).mockReturnValue(
      board({ id: 'other-board', at: Date.now() - 60_000 })
    );
    rerender(<ScheduleWarningBanner />);
    expect(screen.queryByText('Ends in 5 min')).toBeNull();
    expect(playTimerAlert).not.toHaveBeenCalled();
  });

  it('closes when tapped', async () => {
    vi.mocked(useDashboard).mockReturnValue(board());
    const { rerender } = render(<ScheduleWarningBanner />);
    vi.mocked(useDashboard).mockReturnValue(
      board({ id: 'a2', at: Date.now() })
    );
    rerender(<ScheduleWarningBanner />);
    fireEvent.click(await screen.findByText('Ends in 5 min'));
    expect(screen.queryByText('Ends in 5 min')).toBeNull();
  });
});
