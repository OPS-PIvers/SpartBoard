import { render, screen, fireEvent } from '@testing-library/react';
import { BreathingWidget } from './BreathingWidget';
import { WidgetData } from '../../../types';
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
});
