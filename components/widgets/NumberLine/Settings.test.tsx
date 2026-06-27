/**
 * Regression tests for the Escape-cancel bug in NumberLineSettings.
 *
 * Root cause: The min, max, and step inputs used `defaultValue` (uncontrolled)
 * with `onBlur` to save. There was no Escape handler, so pressing Escape in the
 * browser triggered a native blur, which fired `onBlur` and saved the
 * typed-but-intended-to-cancel value. This is the same stale-onBlur pattern
 * fixed in DraggableWindow (#1965), RandomGroups (#1974), FolderTree (#1975),
 * and PollWidget (#2064).
 *
 * Fix: Each input now has an Escape branch in `onKeyDown` that sets a per-field
 * `cancelledRef` to `true` and resets the DOM value before calling
 * `e.currentTarget.blur()`. The `onBlur` handler checks the ref and returns
 * early (skipping `updateConfig`) when it's set, then resets the ref so
 * subsequent normal saves work.
 *
 * jsdom note: `e.currentTarget.blur()` inside a keyDown handler is a no-op in
 * jsdom — it does NOT dispatch a blur event. Tests therefore fire
 * `fireEvent.blur()` manually inside the same `act()` to replicate the
 * synchronous browser sequence (keyDown → blur).
 */
import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NumberLineSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData } from '@/types';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

// TypographySettings / SurfaceColorSettings pull in additional context — stub
// them out so we only need to mock useDashboard.
vi.mock('@/components/common/TypographySettings', () => ({
  TypographySettings: () => null,
}));

vi.mock('@/components/common/SurfaceColorSettings', () => ({
  SurfaceColorSettings: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUpdateWidget = vi.fn();

const baseWidget: WidgetData = {
  id: 'nl-test-1',
  type: 'numberLine',
  x: 0,
  y: 0,
  w: 700,
  h: 300,
  z: 1,
  flipped: true,
  config: {
    min: -10,
    max: 10,
    step: 1,
    displayMode: 'integers',
    showArrows: true,
    markers: [],
    jumps: [],
  },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NumberLineSettings — Escape-cancel regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: mockUpdateWidget,
    });
  });

  // ── Min Value ──────────────────────────────────────────────────────────────

  it('does NOT call updateWidget when Escape is pressed on the Min Value input', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Min Value');

    // Teacher types a new value but then cancels with Escape.
    fireEvent.change(input, { target: { value: '99' } });

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      // jsdom does not fire blur from e.currentTarget.blur(); trigger manually.
      fireEvent.blur(input);
    });

    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('resets the Min Value input to the original value after Escape', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Min Value') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '99' } });

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    // The DOM value should revert to the original min (-10).
    expect(input.value).toBe('-10');
  });

  it('DOES call updateWidget on normal blur of Min Value (Escape cancel does not poison future saves)', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Min Value');

    // First: cancel an edit with Escape.
    fireEvent.change(input, { target: { value: '99' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });
    expect(mockUpdateWidget).not.toHaveBeenCalled();

    // Then: make a real edit and blur normally — save must go through.
    fireEvent.change(input, { target: { value: '-5' } });
    act(() => {
      fireEvent.blur(input);
    });

    expect(mockUpdateWidget).toHaveBeenCalledOnce();
    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'nl-test-1',
      expect.objectContaining({
        config: expect.objectContaining({ min: -5 }) as unknown,
      })
    );
  });

  // ── Max Value ──────────────────────────────────────────────────────────────

  it('does NOT call updateWidget when Escape is pressed on the Max Value input', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Max Value');

    fireEvent.change(input, { target: { value: '999' } });

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('resets the Max Value input to the original value after Escape', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Max Value') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '999' } });

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    expect(input.value).toBe('10');
  });

  it('DOES call updateWidget on normal blur of Max Value after a prior Escape', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Max Value');

    // Cancel first.
    fireEvent.change(input, { target: { value: '999' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });
    expect(mockUpdateWidget).not.toHaveBeenCalled();

    // Real save next.
    fireEvent.change(input, { target: { value: '20' } });
    act(() => {
      fireEvent.blur(input);
    });

    expect(mockUpdateWidget).toHaveBeenCalledOnce();
    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'nl-test-1',
      expect.objectContaining({
        config: expect.objectContaining({ max: 20 }) as unknown,
      })
    );
  });

  // ── Step (Interval) ────────────────────────────────────────────────────────

  it('does NOT call updateWidget when Escape is pressed on the Step input', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Step (Interval)');

    fireEvent.change(input, { target: { value: '5' } });

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('resets the Step input to the original value after Escape', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Step (Interval)') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '5' } });

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    expect(input.value).toBe('1');
  });

  it('DOES call updateWidget on normal blur of Step after a prior Escape', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Step (Interval)');

    // Cancel first.
    fireEvent.change(input, { target: { value: '5' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });
    expect(mockUpdateWidget).not.toHaveBeenCalled();

    // Real save next.
    fireEvent.change(input, { target: { value: '2' } });
    act(() => {
      fireEvent.blur(input);
    });

    expect(mockUpdateWidget).toHaveBeenCalledOnce();
    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'nl-test-1',
      expect.objectContaining({
        config: expect.objectContaining({ step: 2 }) as unknown,
      })
    );
  });

  // ── Enter still saves ──────────────────────────────────────────────────────

  it('saves Min Value on Enter (Enter path unaffected by fix)', () => {
    render(<NumberLineSettings widget={baseWidget} />);

    const input = screen.getByLabelText('Min Value');

    fireEvent.change(input, { target: { value: '-3' } });

    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.blur(input);
    });

    expect(mockUpdateWidget).toHaveBeenCalledOnce();
    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'nl-test-1',
      expect.objectContaining({
        config: expect.objectContaining({ min: -3 }) as unknown,
      })
    );
  });
});
