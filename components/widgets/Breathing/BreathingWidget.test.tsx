import { render, screen, fireEvent } from '@testing-library/react';
import { BreathingWidget } from './BreathingWidget';
import { WidgetData } from '@/types';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockWidget: WidgetData = {
  id: 'test-breathing',
  type: 'breathing',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: false,
  config: {
    pattern: '4-4-4-4',
    visual: 'circle',
    color: '#3b82f6',
  },
};

describe('BreathingWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock requestAnimationFrame to just execute immediately for tests
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      // Execute immediately using setTimeout to work with fake timers
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      clearTimeout(id as unknown as number);
    });

    // Mock performance.now to work correctly with vitest fake timers
    vi.spyOn(performance, 'now').mockImplementation(() => {
      return Date.now();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders initial state correctly', () => {
    render(<BreathingWidget widget={mockWidget} />);

    // Initial state
    expect(screen.getByText('Ready')).toBeInTheDocument();

    // Buttons
    const startButton = screen.getByLabelText('Start');
    expect(startButton).toBeInTheDocument();

    const resetButton = screen.getByLabelText('Reset');
    expect(resetButton).toBeInTheDocument();
    expect(resetButton).toBeDisabled();
  });

  it('starts breathing sequence when play is clicked', () => {
    render(<BreathingWidget widget={mockWidget} />);

    const startButton = screen.getByLabelText('Start');
    fireEvent.click(startButton);

    // Should change to Inhale phase immediately
    expect(screen.getByText('Inhale')).toBeInTheDocument();
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();

    // Reset should be enabled once it started
    const resetButton = screen.getByLabelText('Reset');
    expect(resetButton).not.toBeDisabled();
  });

  it('resets correctly', () => {
    render(<BreathingWidget widget={mockWidget} />);

    const startButton = screen.getByLabelText('Start');
    fireEvent.click(startButton);

    expect(screen.getByText('Inhale')).toBeInTheDocument();

    const resetButton = screen.getByLabelText('Reset');
    fireEvent.click(resetButton);

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByLabelText('Start')).toBeInTheDocument();
  });

  /**
   * Regression test for the Reset button disable logic.
   *
   * Bug: the disable condition is `!isActive && progress === 0`.
   * At a phase boundary (e.g. inhale → hold1), `setProgress(0)` fires.
   * If the user pauses immediately after the transition, the state is:
   *   isActive=false, phase='hold1', progress=0.
   * The condition evaluates `!false && 0===0` → true → button incorrectly
   * disabled, even though the user is mid-session.
   *
   * Fix: use `phase === 'ready'` as the quiescent-state sentinel instead of
   * `progress === 0`, because 'ready' is the only state where reset is a
   * genuine no-op.
   */
  it('Reset button stays enabled when paused at the exact start of a phase (progress=0, phase!=ready)', () => {
    render(<BreathingWidget widget={mockWidget} />);

    // Start the 4-4-4-4 sequence (inhale=4s, hold1=4s, exhale=4s, hold2=4s).
    // Then pause immediately before any progress advances — this leaves the
    // hook in the state isActive=false, phase='inhale', progress=0, which is
    // the same shape as the phase-boundary case (phase!='ready', progress=0).
    fireEvent.click(screen.getByLabelText('Start'));
    expect(screen.getByText('Inhale')).toBeInTheDocument();

    // Pause without letting any RAF ticks fire so progress stays at exactly 0.
    // isActive=false, phase='inhale', progress=0.
    // With the bug: `!isActive && progress===0` → true → Reset is DISABLED (wrong).
    // With the fix: `!isActive && phase==='ready'` → false → Reset is enabled (correct).
    fireEvent.click(screen.getByLabelText('Pause'));
    expect(screen.getByLabelText('Start')).toBeInTheDocument(); // confirm paused

    // The Reset button MUST be enabled — the session has started (phase!='ready')
    // even though progress happens to be 0 right at the phase start.
    expect(screen.getByLabelText('Reset')).not.toBeDisabled();
  });
});
