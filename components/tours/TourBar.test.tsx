import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOUR_BAR_POS_KEY, TourBar } from './TourBar';

const renderBar = (props: Partial<React.ComponentProps<typeof TourBar>> = {}) =>
  render(
    <TourBar
      current={2}
      total={4}
      onNext={vi.fn()}
      autopilot={{ on: false, onChange: vi.fn() }}
      onExit={vi.fn()}
      {...props}
    />
  );

const bar = () => screen.getByRole('toolbar', { name: 'Tour controls' });
const grip = () => screen.getByRole('button', { name: 'Move tour controls' });

describe('TourBar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
  });

  it('shows progress and keeps the tip clear of it', () => {
    renderBar();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByTestId('tour-bar-track').style.width).toBe('50%');
    expect(bar()).toHaveAttribute('data-tour-obstacle');
    expect(bar().className).toContain('left-1/2');
  });

  it('holds every tour control', () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    const onRetry = vi.fn();
    const onExit = vi.fn();
    const onChange = vi.fn();
    const onToggle = vi.fn();
    renderBar({
      onBack,
      onNext,
      onRetry,
      onExit,
      autopilot: { on: false, onChange },
      readAloud: { on: false, onToggle },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Autopilot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    expect(onBack).toHaveBeenCalled();
    expect(onRetry).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(onToggle).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('says Done on the last step and hides Back and Retry when not offered', () => {
    renderBar({ current: 4 });
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('drags by the grip, clamps to the viewport and remembers the spot', () => {
    const onPlace = vi.fn();
    renderBar({ onPlace });
    vi.spyOn(bar(), 'getBoundingClientRect').mockReturnValue({
      x: 300,
      y: 12,
      left: 300,
      top: 12,
      width: 400,
      height: 44,
    } as DOMRect);
    onPlace.mockClear();
    fireEvent.pointerDown(grip(), { button: 0, clientX: 310, clientY: 20 });
    fireEvent.pointerMove(grip(), { clientX: 5000, clientY: 400 });
    expect(bar().style.left).toBe('600px');
    expect(localStorage.getItem(TOUR_BAR_POS_KEY)).toBeNull();
    fireEvent.pointerUp(grip(), { clientX: 5000, clientY: 5000 });
    expect(bar().style.left).toBe('600px');
    expect(bar().style.top).toBe('756px');
    expect(JSON.parse(localStorage.getItem(TOUR_BAR_POS_KEY) ?? '')).toEqual({
      x: 600,
      y: 756,
    });
    expect(onPlace).toHaveBeenCalled();
  });

  it('opens where it was left and double-click puts it back', () => {
    localStorage.setItem(TOUR_BAR_POS_KEY, JSON.stringify({ x: 40, y: 500 }));
    renderBar();
    expect(bar().style.left).toBe('40px');
    expect(bar().style.top).toBe('500px');
    fireEvent.doubleClick(grip());
    expect(bar().className).toContain('left-1/2');
    expect(localStorage.getItem(TOUR_BAR_POS_KEY)).toBeNull();
  });
});
