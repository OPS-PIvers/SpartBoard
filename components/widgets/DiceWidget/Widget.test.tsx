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

  // A DiceFace renders no numeric text — its value is encoded as dot
  // positions, so a face showing value N contains exactly N filled dot
  // elements (the inner `rounded-full` divs). Counting them lets us assert
  // the *displayed value*, not just the number of faces.
  const dotCount = (face: HTMLElement): number =>
    face.querySelectorAll('div.rounded-full').length;

  const faceValues = (): number[] =>
    screen.getAllByTestId('dice-face').map((face) => dotCount(face));

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

  it('reflects a prop-driven config.lastRoll change while not rolling', () => {
    // The displayed value is derived during render
    // (`displayValues = isRolling ? animatedValues : config.lastRoll`), NOT
    // mirrored into state via an effect. A remote/prop lastRoll update while
    // idle must therefore show up immediately on the faces.
    // Math.random is mocked to 0.1 → every random face is a 1, so a lastRoll
    // of all-6s is unambiguously distinguishable from the random fallback.
    const { rerender } = render(
      <DiceWidget widget={createWidgetData(2, [6, 6])} />
    );

    // Sanity: idle widget shows the incoming lastRoll (two 6-faces).
    expect(faceValues()).toEqual([6, 6]);

    // Remote control pushes a new resting roll via props.
    rerender(<DiceWidget widget={createWidgetData(2, [3, 5])} />);

    // No effect/mirror state — the derived value updates on the next render.
    const updated = screen.getAllByTestId('dice-face');
    expect(dotCount(updated[0])).toBe(3);
    expect(dotCount(updated[1])).toBe(5);

    // A pure prop-driven display update must not write back to Firestore.
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('does not let a mid-roll config update clobber the in-flight roll', () => {
    // Regression guard for the removed props→state mirror: a config.lastRoll
    // arriving while a local roll is animating must be ignored on-screen
    // (animatedValues wins because isRolling is true), and the roll must
    // still settle normally and persist its own final values.
    vi.useFakeTimers();

    const { rerender } = render(
      <DiceWidget widget={createWidgetData(2, [6, 6])} />
    );

    const rollButton = screen.getByRole('button', { name: /Roll Dice/i });
    act(() => {
      rollButton.click();
    });

    // Mid-roll: faces are animating. With Math.random → 0.1 the animated
    // values are all 1s, distinct from the [6,6] resting config.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(faceValues()).toEqual([1, 1]);

    // A remote config.lastRoll update lands WHILE the roll is in flight.
    rerender(<DiceWidget widget={createWidgetData(2, [4, 2])} />);

    // The incoming [4,2] must NOT appear — the in-flight roll still owns the
    // display (still animating 1s), proving the roll was not clobbered.
    expect(faceValues()).toEqual([1, 1]);
    // Roll button is still disabled → the roll is genuinely still in flight.
    expect(rollButton).toBeDisabled();

    // Let the roll finish.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The roll persisted its OWN final values (all 1s, from mocked random) —
    // the mid-roll [4,2] config did not interrupt or hijack the roll outcome.
    expect(rollButton).not.toBeDisabled();
    const allCalls = mockUpdateWidget.mock.calls;
    const lastCall = allCalls[allCalls.length - 1];
    const savedLastRoll = (lastCall[1] as { config: { lastRoll: number[] } })
      .config.lastRoll;
    expect(savedLastRoll).toEqual([1, 1]);

    // After settling (isRolling=false), the derived display correctly falls
    // through to the latest prop config.lastRoll ([4,2] from the mid-roll
    // rerender). updateWidget is mocked, so the [1,1] write is not round-
    // tripped back into props — this asserts the derivation, not the mock.
    expect(faceValues()).toEqual([4, 2]);

    vi.useRealTimers();
  });
});
