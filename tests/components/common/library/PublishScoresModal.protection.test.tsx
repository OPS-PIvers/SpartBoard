/**
 * PublishScoresModal — protection toggles
 *
 * Covers the new Quiz-only protection fieldset added below the visibility
 * picker. The modal stays score-visibility-only for VA/GL; protection only
 * renders when the `showProtection` slot is wired by the caller (Quiz Widget).
 *
 * Pattern mirrors the other library-modal tests: render the component, drive
 * interactions via react-testing-library, query through accessible labels.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PublishScoresModal } from '@/components/common/library/PublishScoresModal';
import { RESULTS_PROTECTION_DEFAULTS, type ResultsProtection } from '@/types';

describe('PublishScoresModal — protection toggles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderWithProtection(
    opts: {
      initialProtection?: ResultsProtection;
      onConfirm?: (
        visibility: string,
        protection?: ResultsProtection
      ) => Promise<void> | void;
    } = {}
  ) {
    const onConfirm = opts.onConfirm ?? vi.fn(() => undefined);
    render(
      <PublishScoresModal
        assignmentTitle="Test Quiz"
        currentVisibility={undefined}
        onClose={() => undefined}
        onConfirm={onConfirm}
        initialProtection={
          opts.initialProtection ?? RESULTS_PROTECTION_DEFAULTS
        }
        showProtection
      />
    );
    return { onConfirm };
  }

  it('renders both toggles defaulting from RESULTS_PROTECTION_DEFAULTS', () => {
    renderWithProtection();

    const watermark = screen.getByLabelText(/watermark/i);
    const tabWarning = screen.getByLabelText(/tab.?switch warning/i);

    expect(watermark).toBeChecked();
    expect(tabWarning).not.toBeChecked();
  });

  it('hides the threshold input when tab-warning toggle is off', () => {
    renderWithProtection();

    expect(
      screen.queryByLabelText(/warnings before lockout/i)
    ).not.toBeInTheDocument();
  });

  it('shows threshold input bounded [1, 10] when tab-warning enabled', () => {
    renderWithProtection();

    fireEvent.click(screen.getByLabelText(/tab.?switch warning/i));

    const threshold = screen.getByLabelText(/warnings before lockout/i);

    expect(threshold).toBeInTheDocument();
    expect(threshold).toHaveAttribute('min', '1');
    expect(threshold).toHaveAttribute('max', '10');
    expect(threshold).toHaveValue(3);
  });

  it('clamps the threshold value to [1, 10] on change', () => {
    renderWithProtection();

    fireEvent.click(screen.getByLabelText(/tab.?switch warning/i));
    const threshold = screen.getByLabelText(/warnings before lockout/i);

    // Above max -> clamped to 10
    fireEvent.change(threshold, { target: { value: '99' } });
    expect(threshold).toHaveValue(10);

    // Below min -> clamped to 1
    fireEvent.change(threshold, { target: { value: '0' } });
    expect(threshold).toHaveValue(1);

    // In range -> kept as typed
    fireEvent.change(threshold, { target: { value: '5' } });
    expect(threshold).toHaveValue(5);
  });

  it('passes protection to onConfirm when publishing', async () => {
    const onConfirm = vi.fn(() => undefined);
    renderWithProtection({ onConfirm });

    // Pick a non-default visibility to drive a real submit
    fireEvent.click(screen.getByRole('radio', { name: /score only/i }));

    // Enable tab warning, set threshold to 5
    fireEvent.click(screen.getByLabelText(/tab.?switch warning/i));
    const threshold = screen.getByLabelText(/warnings before lockout/i);
    fireEvent.change(threshold, { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /publish/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(onConfirm).toHaveBeenCalledWith('score-only', {
      watermarkEnabled: true,
      tabWarningEnabled: true,
      tabWarningThreshold: 5,
    });
  });

  it('pre-fills from initialProtection prop when present', () => {
    renderWithProtection({
      initialProtection: {
        watermarkEnabled: false,
        tabWarningEnabled: true,
        tabWarningThreshold: 7,
      },
    });

    const watermark = screen.getByLabelText(/watermark/i);
    const tabWarning = screen.getByLabelText(/tab.?switch warning/i);
    const threshold = screen.getByLabelText(/warnings before lockout/i);

    expect(watermark).not.toBeChecked();
    expect(tabWarning).toBeChecked();
    expect(threshold).toHaveValue(7);
  });

  it('does NOT render the protection fieldset when showProtection is not set', () => {
    render(
      <PublishScoresModal
        assignmentTitle="VA Activity"
        currentVisibility={undefined}
        onClose={() => undefined}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/watermark/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/tab.?switch warning/i)
    ).not.toBeInTheDocument();
  });
});
