import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { DiceWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WidgetData } from '@/types';

// Mock audio utilities to prevent context errors during tests
vi.mock('./utils/audio', () => ({
  getDiceAudioCtx: vi.fn(() => ({
    state: 'running',
    resume: vi.fn(),
  })),
  playRollSound: vi.fn(),
}));

// Mock the dashboard context provider
vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

describe('DiceWidget', () => {
  const mockUpdateWidget = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: { globalStyle: { fontFamily: 'sans' } },
      updateWidget: mockUpdateWidget,
    });
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
    config: {
      count,
      lastRoll,
    },
    layout: { w: 4, h: 4, x: 0, y: 0, zIndex: 1 },
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
});
