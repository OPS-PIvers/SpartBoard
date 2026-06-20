import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { DiceWidget } from './Widget';
import {
  useGlobalStyle,
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WidgetData, DEFAULT_GLOBAL_STYLE } from '@/types';

// Mock audio utilities to prevent context errors during tests
vi.mock('./utils/audio', () => ({
  getDiceAudioCtx: vi.fn(() => ({
    state: 'running',
    resume: vi.fn(),
  })),
  playRollSound: vi.fn(),
}));

// Mock the mount-stable dashboard store surfaces the widget consumes.
vi.mock('@/context/dashboardCanvasStore');

describe('DiceWidget', () => {
  const mockUpdateWidget = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGlobalStyle).mockReturnValue(DEFAULT_GLOBAL_STYLE);
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: mockUpdateWidget,
    } as unknown as DashboardActions);
    // Mock random so dice rolls are deterministic in tests (always roll 1)
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createWidgetData = (
    count: number,
    lastRoll?: number[]
  ): WidgetData => ({
    id: 'test-dice-1',
    type: 'dice',
    x: 0,
    y: 0,
    z: 1,
    w: 4,
    h: 4,
    flipped: false,
    config: {
      count,
      lastRoll,
    },
  });

  it('renders initial dice correctly', () => {
    render(<DiceWidget widget={createWidgetData(2)} />);
    const diceFaces = screen.getAllByTestId('dice-face');
    expect(diceFaces).toHaveLength(2);
  });

  it('updates dice when count prop changes', () => {
    const { rerender } = render(<DiceWidget widget={createWidgetData(2)} />);
    expect(screen.getAllByTestId('dice-face')).toHaveLength(2);

    rerender(<DiceWidget widget={createWidgetData(4)} />);
    expect(screen.getAllByTestId('dice-face')).toHaveLength(4);
  });

  it('recovers from out-of-sync values arrays if diceCount changes during a roll', () => {
    vi.useFakeTimers();

    const { rerender } = render(<DiceWidget widget={createWidgetData(2)} />);
    expect(screen.getAllByTestId('dice-face')).toHaveLength(2);

    const rollButton = screen.getByRole('button', { name: /Roll Dice/i });

    act(() => {
      rollButton.click();
    });

    act(() => {
      vi.advanceTimersByTime(500); // mid-roll
    });

    // Simulate prop change (e.g. from a remote control setting the count to 5)
    rerender(<DiceWidget widget={createWidgetData(5)} />);

    // Fast-forward to end of roll
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // We expect the state to be re-synchronized to 5 dice due to our values.length !== diceCount guard
    expect(screen.getAllByTestId('dice-face')).toHaveLength(5);

    vi.useRealTimers();
  });

  it('persists lastRoll with the current diceCount when count changes mid-roll', () => {
    // Regression test for stale-closure bug: roll() captured diceCount from
    // the render scope. If props changed from 2→4 while the interval was
    // running, the final updateWidget call used the stale count (2) instead
    // of the new count (4), persisting a lastRoll array with the wrong length.
    vi.useFakeTimers();

    const { rerender } = render(<DiceWidget widget={createWidgetData(2)} />);

    const rollButton = screen.getByRole('button', { name: /Roll Dice/i });
    act(() => {
      rollButton.click();
    });

    // Advance mid-roll (interval fires every 80ms, 12 ticks total = 960ms)
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Change dice count to 4 while the roll is in-flight
    rerender(<DiceWidget widget={createWidgetData(4)} />);

    // Complete the roll
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The last updateWidget call should persist a lastRoll array whose length
    // matches the NEW diceCount (4), not the stale one (2).
    const allCalls = mockUpdateWidget.mock.calls;
    const lastCall = allCalls[allCalls.length - 1];
    const savedLastRoll = (lastCall[1] as { config: { lastRoll: number[] } })
      .config.lastRoll;

    expect(savedLastRoll).toHaveLength(4);

    vi.useRealTimers();
  });
});
