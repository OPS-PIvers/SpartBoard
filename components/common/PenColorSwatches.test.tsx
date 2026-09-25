import React from 'react';
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { DEFAULT_PEN_COLORS } from '@/utils/penColors';
import { PenColorSwatches } from './PenColorSwatches';

const TEACHER = ['#111111', '#222222', '#333333', '#444444', '#555555'];

describe('PenColorSwatches', () => {
  let savePenColors: Mock;
  let onSelect: Mock;

  beforeEach(() => {
    savePenColors = vi.fn();
    onSelect = vi.fn();
  });

  const renderSwatches = (value = '#111111') =>
    render(
      <AuthContext.Provider
        value={
          {
            penColors: TEACHER,
            savePenColors,
            featurePermissions: [],
            selectedBuildings: [],
          } as unknown as AuthContextType
        }
      >
        <PenColorSwatches value={value} onSelect={onSelect} variant="window" />
      </AuthContext.Provider>
    );

  it("renders the teacher's five presets plus a custom button", () => {
    renderSwatches();
    expect(screen.getByLabelText('Pen color 1')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('Pen color 5')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Custom color' })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects a preset on click', () => {
    renderSwatches();
    fireEvent.click(screen.getByLabelText('Pen color 3'));
    expect(onSelect).toHaveBeenCalledWith('#333333');
  });

  it('lights up the custom button for a color outside the presets', () => {
    renderSwatches('#abcdef');
    expect(
      screen.getByRole('button', { name: 'Custom color' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('right-click edits a preset and saves the new palette', () => {
    const { container } = renderSwatches();
    fireEvent.contextMenu(screen.getByLabelText('Pen color 2'), {
      clientX: 10,
      clientY: 10,
    });
    expect(onSelect).toHaveBeenCalledWith('#222222');

    const editInput = container.querySelectorAll('input[type="color"]')[1];
    fireEvent.change(editInput, { target: { value: '#ff0000' } });
    expect(savePenColors).toHaveBeenCalledWith([
      '#111111',
      '#ff0000',
      '#333333',
      '#444444',
      '#555555',
    ]);
    expect(onSelect).toHaveBeenLastCalledWith('#ff0000');
  });

  it('resets to defaults and returns to the swatch row', () => {
    renderSwatches();
    fireEvent.contextMenu(screen.getByLabelText('Pen color 2'), {
      clientX: 10,
      clientY: 10,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset pen colors' }));
    expect(savePenColors).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByLabelText('Pen color 1')).toBeInTheDocument();
  });

  it('long-press on touch opens the editor', () => {
    vi.useFakeTimers();
    try {
      renderSwatches();
      const swatch = screen.getByLabelText('Pen color 4');
      fireEvent.pointerDown(swatch, { pointerType: 'touch' });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(
        screen.getByRole('button', { name: 'Change color 4' })
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Escape closes an editor opened via touch long-press even though focus never moved into it', () => {
    vi.useFakeTimers();
    try {
      renderSwatches();
      const swatch = screen.getByLabelText('Pen color 4');
      fireEvent.pointerDown(swatch, { pointerType: 'touch' });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(
        screen.getByRole('button', { name: 'Change color 4' })
      ).toBeInTheDocument();

      // Focus was never moved into the group (only the keyboard-menu path does
      // that), so Escape lands on document.body, not on any element inside it.
      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(
        screen.queryByRole('button', { name: 'Change color 4' })
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Pen color 4')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dismisses an editor opened via touch long-press on an outside pointerdown', () => {
    vi.useFakeTimers();
    try {
      renderSwatches();
      const swatch = screen.getByLabelText('Pen color 4');
      fireEvent.pointerDown(swatch, { pointerType: 'touch' });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(
        screen.getByRole('button', { name: 'Change color 4' })
      ).toBeInTheDocument();

      // Tapping anything other than "Done" (e.g. the drawing canvas behind this
      // toolbar) should close the small editor instead of leaving it open forever.
      fireEvent.pointerDown(document.body);

      expect(
        screen.queryByRole('button', { name: 'Change color 4' })
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Pen color 4')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't leave a stale window Escape listener that hijacks a later, unrelated Escape", () => {
    vi.useFakeTimers();
    try {
      renderSwatches();
      const swatch = screen.getByLabelText('Pen color 4');
      fireEvent.pointerDown(swatch, { pointerType: 'touch' });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      // Abandon the editor without pressing "Done" or Escape — the outside
      // pointerdown above closes it and must also tear down the capture-phase
      // window Escape listener, or it would keep intercepting Escape forever.
      fireEvent.pointerDown(document.body);
      expect(
        screen.queryByRole('button', { name: 'Change color 4' })
      ).not.toBeInTheDocument();

      const bubbleListener = vi.fn();
      window.addEventListener('keydown', bubbleListener);
      try {
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(bubbleListener).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener('keydown', bubbleListener);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the default presets without an AuthProvider and cannot edit', () => {
    render(
      <PenColorSwatches value="#000000" onSelect={onSelect} variant="window" />
    );
    fireEvent.click(screen.getByLabelText('Pen color 1'));
    expect(onSelect).toHaveBeenCalledWith(DEFAULT_PEN_COLORS[0]);
    fireEvent.contextMenu(screen.getByLabelText('Pen color 1'));
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });
});
