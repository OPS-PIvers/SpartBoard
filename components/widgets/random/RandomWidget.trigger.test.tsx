import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { RandomWidget } from './RandomWidget';
import { useDashboard } from '@/context/useDashboard';
import { claimBoardTrigger } from '@/utils/boardTriggerClaim';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WidgetData, RandomConfig } from '@/types';

vi.mock('@/context/useDashboard');
vi.mock('@/utils/boardTriggerClaim', () => ({ claimBoardTrigger: vi.fn() }));

// The widget reads both roster-groups gates. Default them OFF so these suites
// exercise the pre-feature behaviour; the group tests opt in explicitly.
const canAccessFeatureMock = vi.fn<(id: string) => boolean>(() => false);
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: canAccessFeatureMock }),
}));
const rosterGroupsRolloutMock = vi.fn(() => ({ enabled: false }));
vi.mock('@/hooks/useRosterGroupsIntegrationSettings', () => ({
  useRosterGroupsIntegrationSettings: () => rosterGroupsRolloutMock(),
}));

// Mock subcomponents
vi.mock('./RandomWheel', () => ({
  RandomWheel: () => <div data-testid="random-wheel" />,
}));
vi.mock('./RandomSlots', () => ({
  RandomSlots: () => <div data-testid="random-slots" />,
}));
vi.mock('./RandomFlash', () => ({
  RANDOM_FLASH_PLACEHOLDER: 'Ready?',
  RandomFlash: () => <div data-testid="random-flash" />,
}));
vi.mock('./audioUtils', () => ({
  getAudioCtx: vi.fn(),
  playTick: vi.fn(),
  playWinner: vi.fn(),
}));

// Mock WidgetLayout to render header, content, and footer
vi.mock('../WidgetLayout', () => ({
  WidgetLayout: ({
    header,
    content,
    footer,
  }: {
    header?: React.ReactNode;
    content: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <div data-testid="widget-layout">
      {header && <div data-testid="header">{header}</div>}
      <div data-testid="content">{content}</div>
      <div data-testid="footer">{footer}</div>
    </div>
  ),
}));

const updateWidget = vi.fn();
const widgetFor = (externalTrigger: number): WidgetData => ({
  id: 'random-1',
  type: 'random',
  x: 0,
  y: 0,
  w: 300,
  h: 300,
  z: 1,
  flipped: false,
  config: {
    firstNames: 'Ann\nBen\nCal',
    lastNames: '',
    mode: 'single',
    soundEnabled: false,
    rosterMode: 'custom',
    externalTrigger,
  },
});

const picked = () =>
  updateWidget.mock.calls.some(
    ([, u]) =>
      (u as { config?: Partial<RandomConfig> }).config?.lastResult !== undefined
  );

describe('RandomWidget timer trigger', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addWidget: vi.fn(),
      updateDashboard: vi.fn(),
      addToast: vi.fn(),
      activeDashboard: { id: 'board-1', widgets: [], sharedGroups: [] },
      rosters: [],
      activeRosterId: null,
    });
  });
  afterEach(() => vi.useRealTimers());

  const fire = async () => {
    const { rerender } = render(<RandomWidget widget={widgetFor(100)} />);
    rerender(<RandomWidget widget={widgetFor(200)} />);
    await waitFor(() => expect(claimBoardTrigger).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
  };

  it('picks when this device claims the trigger', async () => {
    vi.mocked(claimBoardTrigger).mockResolvedValue(true);
    await fire();
    expect(picked()).toBe(true);
  });

  it('leaves the pick to the device that claimed it', async () => {
    vi.mocked(claimBoardTrigger).mockResolvedValue(false);
    await fire();
    expect(picked()).toBe(false);
  });
});
