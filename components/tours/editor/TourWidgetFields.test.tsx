import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TourWidgetFields } from './TourWidgetFields';

const renderFields = (anchor: string) => {
  const onChange = vi.fn();
  render(
    <TourWidgetFields
      tour={{ anchor, action: 'click' }}
      onChange={onChange}
      labelClass=""
      inputClass=""
    />
  );
  return onChange;
};

describe('TourWidgetFields row picker', () => {
  it('offers any row on a list anchor instead of its settings', () => {
    const onChange = renderFields('library-shell.archive-menu:quiz');
    expect(screen.queryByTestId('tour-editor-field-key')).toBeNull();
    const rows = screen.getByTestId('tour-editor-row-key');
    fireEvent.change(rows, { target: { value: 'row-*' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: 'library-shell.archive-menu:quiz#row-*',
      })
    );
  });

  it('shows a row the step already names', () => {
    renderFields('classes.set-active:classes#row-12');
    expect(
      screen.getByTestId<HTMLSelectElement>('tour-editor-row-key').value
    ).toBe('row-12');
  });

  it('keeps the setting picker on anchors that are not lists', () => {
    renderFields('library-shell.archive-menu-item:quiz#row-1-item-2');
    expect(screen.queryByTestId('tour-editor-row-key')).toBeNull();
  });
});
