import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StationsWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { claimBoardTrigger } from '@/utils/boardTriggerClaim';
import { WidgetData, StationsConfig } from '@/types';

vi.mock('@/context/useDashboard');
vi.mock('@/utils/boardTriggerClaim', () => ({
  claimBoardTrigger: vi.fn(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => false }),
}));
vi.mock('@/hooks/useRosterGroupsIntegrationSettings', () => ({
  useRosterGroupsIntegrationSettings: () => ({ enabled: false }),
}));

const updateWidget = vi.fn();
const widgetFor = (config: Partial<StationsConfig>): WidgetData =>
  ({
    id: 'stations-1',
    type: 'stations',
    x: 0,
    y: 0,
    w: 600,
    h: 420,
    z: 1,
    config: {
      rosterMode: 'class',
      assignments: { s1: 'st-a' },
      stations: [
        { id: 'st-a', title: 'Reading', color: '#10b981', order: 0 },
        { id: 'st-b', title: 'Math', color: '#f59e0b', order: 1 },
      ],
      ...config,
    },
  }) as WidgetData;

describe('StationsWidget rotation trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast: vi.fn(),
      rosters: [
        {
          id: 'roster-1',
          name: 'Class 1A',
          students: [{ id: 's1', firstName: 'John', lastName: 'Doe' }],
        },
      ],
      activeRosterId: 'roster-1',
      activeDashboard: { id: 'board-1', widgets: [{ id: 'stations-1' }] },
      dashboards: [{ id: 'board-1', widgets: [{ id: 'stations-1' }] }],
    });
  });

  const rotated = () =>
    updateWidget.mock.calls.some(
      ([, u]) =>
        (u as { config?: StationsConfig }).config?.assignments?.s1 === 'st-b'
    );

  it('rotates once when this device claims the new trigger', async () => {
    vi.mocked(claimBoardTrigger).mockResolvedValue(true);
    const { rerender } = render(
      <StationsWidget widget={widgetFor({ rotationTrigger: 100 })} />
    );
    await screen.findByText('John Doe');
    expect(claimBoardTrigger).not.toHaveBeenCalled();

    rerender(<StationsWidget widget={widgetFor({ rotationTrigger: 200 })} />);
    await waitFor(() => expect(rotated()).toBe(true));
    expect(claimBoardTrigger).toHaveBeenCalledWith(
      'board-1',
      'stations-1',
      200
    );
  });

  it('leaves the rotation to the device that claimed it', async () => {
    vi.mocked(claimBoardTrigger).mockResolvedValue(false);
    const { rerender } = render(
      <StationsWidget widget={widgetFor({ rotationTrigger: 100 })} />
    );
    await screen.findByText('John Doe');
    rerender(<StationsWidget widget={widgetFor({ rotationTrigger: 200 })} />);
    await waitFor(() => expect(claimBoardTrigger).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(rotated()).toBe(false);
  });
});
