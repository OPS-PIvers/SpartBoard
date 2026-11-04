import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PEN_COLORS } from '@/utils/penColors';
import { getAnnotateToolbarLayout } from '@/utils/annotateToolbarLayout';
import { WidgetAnnotateToolbar } from './WidgetAnnotateToolbar';

const renderToolbar = (
  availableWidth: number,
  color = DEFAULT_PEN_COLORS[0]
) => {
  const handlers = {
    onColorChange: vi.fn(),
    onUndo: vi.fn(),
    onClearAll: vi.fn(),
    onDone: vi.fn(),
  };
  render(
    <WidgetAnnotateToolbar
      widgetId="w1"
      widgetType="time-tool"
      availableWidth={availableWidth}
      color={color}
      {...handlers}
    />
  );
  return handlers;
};

describe('WidgetAnnotateToolbar', () => {
  it('picks a layout from the available width', () => {
    expect(getAnnotateToolbarLayout(500)).toBe('full');
    expect(getAnnotateToolbarLayout(300)).toBe('colors-collapsed');
    expect(getAnnotateToolbarLayout(180)).toBe('compact');
  });

  it('shows every swatch and tool inline when wide', () => {
    renderToolbar(500);
    expect(screen.getByLabelText('Pen color 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Eraser')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pen colors' })
    ).not.toBeInTheDocument();
  });

  it('folds the colors into a popover that closes after a preset pick', () => {
    const { onColorChange } = renderToolbar(300);
    expect(screen.queryByLabelText('Pen color 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Eraser')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pen colors' }));
    fireEvent.click(screen.getByLabelText('Pen color 2'));

    expect(onColorChange).toHaveBeenCalledWith(DEFAULT_PEN_COLORS[1]);
    expect(screen.queryByLabelText('Pen color 2')).not.toBeInTheDocument();
  });

  it('keeps every tool and Done reachable when compact', () => {
    const { onUndo, onClearAll, onDone, onColorChange } = renderToolbar(180);
    expect(screen.queryByLabelText('Eraser')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByLabelText('Undo'));
    expect(onUndo).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Eraser'));
    expect(onColorChange).toHaveBeenCalledWith('eraser');
    expect(screen.queryByLabelText('Clear All')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByLabelText('Clear All'));
    expect(onClearAll).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Done'));
    expect(onDone).toHaveBeenCalled();
  });

  it('closes an open popover on a pointerdown outside the toolbar', () => {
    renderToolbar(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pen colors' }));
    expect(screen.getByLabelText('Pen color 1')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByLabelText('Pen color 1')).not.toBeInTheDocument();
  });
});
